/*
  extensions.js

  Should be limited to really basic stuff that would never depend on
  anything else but standard ECMAScript.
*/

var D = require('./debugger.js').debugger;
D.log('loading ' + __filename);

/* 3rd party modules -- Node standard */
var net = require('net');
var crypto = require('crypto');

/* Local modules */
var C = require('./constants.js');


/*
 * net.Socket extensions
 */
net.Socket.prototype.websocket_accept_key = function(request_headers) {
    var concat_key = request_headers['sec-websocket-key'] + C.WEBSOCKET_MAGIC_APPEND;
    return crypto.createHash('sha1').update(concat_key).digest('base64');
};


net.Socket.prototype.websocket_start = function(request_headers, on_success) {
    var self = this;
    self.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
               'Arr-Disable-Session-Affinity: true\r\n' +
               'Upgrade: WebSocket\r\n' +
               'Connection: Upgrade\r\n' +
               'Sec-WebSocket-Accept: ' + this.websocket_accept_key(request_headers) + '\r\n' +
               '\r\n',
               'utf8', function() {
                   D.log('socket upgrade request complete for ' + self.details());
                   self.is_websocket = true;
		   on_success();
               });
};


net.Socket.prototype.toString = function() {
    return this.address().family + '(' + this.localAddress + ':' + this.localPort + ') -> ' + 
        this.remoteFamily + '(' + this.remoteAddress + ':' + this.remotePort + ')';
}


net.Socket.prototype.details = function() {
    return this.toString() +
        ' buf: ' + this.bufferSize + ' written: ' + this.bytesWritten + ' read: ' + this.bytesRead;
};


net.Socket.prototype.websocket_write = function(payload) {
    var header_length;
    var payload_length;

    if ( typeof payload !== 'string' ) {
        payload = JSON.stringify(payload);
    }
    /*!@#$! payload.length is not well defined or meaningful. It might be UTF16
      or length of visible graphemes or something else. */
    payload_length = Buffer.byteLength(payload, 'utf8');

    if ( payload_length > C.MAX_MESSAGE_LENGTH ) {
        throw 'Message exceeds maximum of ' + C.MAX_MESSAGE_LENGTH + ' bytes';
    }
    
    if ( payload_length <= 125 ) {
        header_length = 1;
    }
    else if ( payload_length <= 65535 ) {
        header_length = 3;
    }
    else {
        header_length = 9;
    }
    var bytes = new ArrayBuffer(1 + header_length);
    var header = new DataView(bytes);
    /* limiting assumption of our implementation: all JSON so all text */
    header.setUint8(0, C.WEBSOCKET_FIN_BIT | C.WEBSOCKET_OPCODE_TEXT, false); 
    if ( payload_length <= 125 ) {
        header.setUint8(1, payload_length, false); /* false = big endian = network byte order */
    }
    else if ( payload_length <= 65535 ) {
        header.setUint8(1, 126, false);
        header.setUint16(2, payload_length, false);
    }
    else {
        header.setUint8(1, 127, false);
        /* technically this is a 64-bit uint at offset 2 but not a useful corner case */
        header.setUint32(6, payload_length, false); 
    }
    /* TODO: Analyze how much copying actually occurs here */
    this.write(new Buffer(new Uint8Array(bytes))); 
    this.write(payload);
};


// payload arrives as https://nodejs.org/api/buffer.html
net.Socket.prototype.websocket_read = function(frame) {
    var type_byte = frame.readUInt8(0);
    var opcode = type_byte & C.WEBSOCKET_OPCODE_MASK;
    var mask_offset, payload_offset;
    var masking_key;

    if ( !type_byte & C.WEBSOCKET_FIN_BIT ) {
        D.log('WARNING: Got a fragment');
    }
    switch ( opcode ) {
        case C.WEBSOCKET_OPCODE_CLOSE:
        D.log('Connection closed'); /* no further action; socket will get a TCP close event */
        return null;
        
        case C.WEBSOCKET_OPCODE_BINARY: /* Doesn't seem to matter */
        case C.WEBSOCKET_OPCODE_TEXT:
        break; /* continue parsing below */

        case C.WEBSOCKET_OPCODE_PONG: /* MAY be sent according to RFC 6455 and SHOULD be ignored */
        return null;

        case C.WEBSOCKET_OPCODE_PING: /* MUST respond with same data TODO: Respond to pings */
        D.log("ignoring ping");
        return null;

        default:
        D.log("WARNING: Unexpected opcode in websocket frame: " + opcode);
        return null;
    }

    var length_byte = frame.readUInt8(1) & 0x7F;
    if ( length_byte <= 125 ) {
        length = length_byte;
        mask_offset = 2;
    }

    // CAREFUL: THIS COST MANY HOURS: OF COURSE IT COMES IN AS NETWORK BYTE ORDER so BE not LE.
    // It only bytes you when the values get bigger than 126 and you need 2 or 4 bytes.
    else if ( length_byte == 126 ) {
        length = frame.readUInt16BE(2);
        mask_offset = 4;
    }
    else {
        length = frame.readUInt32BE(6);
        mask_offset = 10;
    }
    if ( frame.readUInt8(1) & 0x80 ) {
        masking_key = new Buffer(4);
        frame.copy(masking_key, 0, mask_offset, mask_offset + 4);
        payload_offset = mask_offset + 4;
    }
    else {
        D.log('WARNING: No mask on client data');
        payload_offset = mask_offset;
    }

    var payload = new Buffer(length);
    frame.copy(payload, 0, payload_offset, payload_offset + length);
    if ( masking_key ) {
        for ( i = 0; i < payload.length; i++ ) {
            payload[i] ^= masking_key[i % 4];
        }
    }

    try {
        return JSON.parse(payload.toString('utf8'));
    }
    catch ( exc ) {
        D.log('Well I should really crash  but: Could not parse JSON: ' + D.dump(exc));
        return null;
    }
};


// \xA3N_B\xB0"\x11\xE6\x93\xC2\x0E>\xB6\xC6x\x84 --> "a34e5f42-b022-11e6-93c2-0e3eb6c67884"
String.prototype.escapedSQLValToUUID = function() {
    var state = 'NORMAL'; /* 'ESCAPE', 'HEX_HIGH', 'HEX_LOW' */
    var hexOut = '';
    for ( var i = 0; i < this.length; i++ ) {
	let asc_char = this[i];
	let asc_code = this.charCodeAt(i);
	switch ( state ) {
	case 'NORMAL':
	    if ( asc_code == 92 ) {
		state = 'ESCAPE';
	    }
	    else {
		hexOut += (asc_code < 16 ? '0' : '') + asc_code.toString(16);
		/* remain in NORMAL */
	    }
	    break;

	case 'ESCAPE':
	    if ( asc_char == 'x' || asc_char == 'X' ) {
		state = 'HEX_HIGH';
	    }
	    else if ( asc_code == 92 ) {
		hexOut += asc_code.toString(16);
		state = 'NORMAL';
	    }
	    else {
		D.log('ERROR: Invalid escape character: ' + asc_char + ' in: "' + this + '"');
		return null;
	    }
	    break;

	case 'HEX_HIGH':
	    hexOut += asc_char.toLowerCase();
	    state = 'HEX_LOW';
	    break;

	case 'HEX_LOW':
	    hexOut += asc_char.toLowerCase();
	    state = 'NORMAL';
	    break;

	default:
	    D.log('ERROR: Invalid parsing state: ' + state);
	    return null;
	}
	const len = hexOut.length;
	/* not 12, 16, and 20 because the dashes make the string longer */
	if ( len == 8 || len == 13 || len == 18 || len == 23 ) {
	    hexOut += '-';
	}
    }
    return hexOut;
};


String.prototype.capitalizeFirst = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
};


String.prototype.sha256hash = function() {
    return crypto.createHash('sha256').update(this.valueOf()).digest('hex');
};


String.prototype.urlParamValue = function() {
    var desiredVal = null;
    var paramName = this.valueOf();
    window.location.search.substring(1).split('&').some(function(currentValue, _, _) {
	var nameVal = currentValue.split('=');
	if ( decodeURIComponent(nameVal[0]) === paramName ) {
	    desiredVal = decodeURIComponent(nameVal[1]);
	    return true;
	}
	return false;
    });
    return desiredVal;
};

    
/* Buffer extensions */
Buffer.prototype.to_hex = function() {
    var s = '';
    for ( i = 0; i < this.length; i++ ) {
        s += this.readUInt8(i).to_hex() + ' ';
        if ( i % 32 == 31 ) {
            s += '\n';
        }
    }
    return s
};

D.log('loaded ' + __filename);
