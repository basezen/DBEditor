/*
  utilities.js
*/

var D = require('./debugger.js').debugger;
D.log('loading ' + __filename);

/* 3rd party modules -- Node standard */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

/* Local modules */
var cfg = require('../config'); // TODO: This seems funny like a backwards dependency. Inject forwards.
var C = require('./constants');

var extension_to_mimetype = {
    '.js'  : { mime: 'application/javascript', encoding: 'utf8'   },
    '.json': { mime: 'application/json',       encoding: 'utf8'   },
    '.pdf' : { mime: 'application/pdf',        encoding: 'binary' },
    '.html': { mime: 'text/html',              encoding: 'utf8'   },
    '.css' : { mime: 'text/css',               encoding: 'utf8'   },
    '.txt' : { mime: 'text/plain',             encoding: 'utf8'   },
};


var Utilities = function() {
    /* TODO: This is still dumping-ground-ish. Document better and move some to extensions */
    this.check_params = function(required_params, request_params, response_stream) {
	for ( var rpi = 0; rpi < required_params.length; rpi++ ) {
	    if ( !(required_params[rpi] in request_params) ) {
		throw { rs: response_stream, message: 'Missing parameter: ' + required_params[rpi]};
	    }
	}
    };
    

    this.write_pidfile = function() {
	if ( typeof process.env.SERVER_PID_FILE !== 'string' ) {
	    throw 'SERVER_PID_FILE not defined';
	}
	fs.open(process.env.SERVER_PID_FILE, 'w', function(open_err, fd) {
	    if ( open_err ) {
		throw 'Unable to open PID file for writing: ' + cfg.PID_FILE + ': ' + open_err;
	    }
	    fs.write(fd, process.pid, 0, 'utf8', function(write_err) {
		if ( write_err ) {
		    throw 'Unable to write to PID file: ' + cfg.PID_FILE + ': ' + write_err;
		}
		fs.close(fd, function(close_err) {
		    if ( close_err ) {
			throw 'Unable to close PID file: ' + cfg.PID_FILE + ': ' + close_err;
		    }
		}); /* close */
	    }); /* write */
	}); /* open */
    };


    this.to_mime = function(ext) {
	var res = extension_to_mimetype[ext];
	if ( !res ) {
	    return res;
	}
	else if ( res.encoding.indexOf('utf') === 0 ) {
	    return { mime: res.mime + '; charset=' + res.encoding, encoding: res.encoding };
	}
	else {
	    return res;
	}
    };


    this.cookieDomain = function(request_headers) {
	var host = request_headers.host;
	var start = host.indexOf('.');
	var end = host.indexOf(':');
	var domain = start == -1 ? '' : host.substring(0, end == -1 ? host.length : end);
	return domain;
    };
    
    /* More friendly than iso_date in case humans browse */
    this.file_timestamp = function(date) {
	return Date.days[date.getUTCDay()] + '_' 
	    + date.getUTCFullYear() 
	    + '-' + Date.months[date.getUTCMonth()]
	    + '-' + date.getUTCDate().format(2) 
	    + '_' + date.getUTCHours().format(2)
	    + date.getUTCMinutes().format(2)
	    + date.getUTCSeconds().format(2);
    };

    this.HTTPHeaderUTC = function(date) {
	return Date.days[date.getUTCDay()] + ', ' 
	    + date.getUTCDate().format(2) 
	    + ' ' + Date.months[date.getUTCMonth()]
	    + ' ' + date.getUTCFullYear() 
	    + ' ' + date.getUTCHours().format(2)
	    + ':' + date.getUTCMinutes().format(2)
	    + ':' + date.getUTCSeconds().format(2)
	    + ' GMT';
    };
    
    var i, j;
    for ( this.pwr10 = [], i = 1, j = 0; i <= 1000000000; i *= 10, j++ ) {
	this.pwr10[j] = i;
    }

    this.get_language = function() {
	if ( typeof this.language === 'undefined' ) {
	    this.language = window.navigator.userLanguage || window.navigator.language;
	}
	return this.language;
    };


    this.form_popup = function(msg, zindex, do_action, cancel_action) {
	var form = $('<form>').addClass('recursive').css('z-index', zindex).html('<span>' + msg + '</span>');
	$('<input />', { type: 'button', value: f.m('OP_CONFIRM') }).css('float', 'left').appendTo(form)
	    .on('click', do_action);
	$('<input />', { type: 'button', value: f.m('OP_CANCEL') }).css('float', 'left').appendTo(form)
	    .on('click', cancel_action);
	return form;
    };


    this.format_bytes = function(bytes) {
	if ( typeof bytes !== 'number' ) {
	    throw 'invalid argument type: ' + typeof bytes;
	}
	
	if ( bytes >= C.GIGABYTE ) {
	    return (bytes / C.GIGABYTE).toFixed(2) + ' GB';
	}
	if ( bytes >= C.MEGABYTE ) {
	    return (bytes / C.MEGABYTE).toFixed(2) + ' MB';
	}
	if ( bytes >= C.KILOBYTE ) {
	    return (bytes / C.KILOBYTE).toFixed(2) + ' KB';
	}
	return bytes + ' bytes';
    };
    
    
    this.float_truncate = function(val) {
	return val < 0 ? Math.round(val) : Math.floor(val);
    };


    this.float_round = function(val, digits) {
	if ( digits === null ) { /* DB fields are null when not set */
	    digits = 0; 
	}
	if ( typeof digits !== 'number' || digits < 0 || digits > 10 ) {
	    throw 'Invalid # of digits for rounding: ' + typeof digits + ' ' + d.ldump(digits);
	}
	if ( typeof val !== 'number' ) {
	    throw 'Invalid value for rounding: ' + d.ldump(val);
	}
	var trunc = this.float_truncate(val);
	var fraction = val - trunc;
	return trunc + Math.round(fraction * this.pwr10[digits]) / this.pwr10[digits];
    };
    
    
    this.to_array = function(dictionary) {
	var arr = new Array();
	var index = 0;
	for ( key in dictionary ) {
	    arr[index++] = dictionary[key];
	}
	return arr;
    };


    // XXX outdated
    this.browser_compatibility_tweaks = function() {
	var rules = document.styleSheets[0].cssRules;
	for ( var i = 0; i < rules.length; i++ ) {
	    var rule = rules[i];
	    if ( rule.selectorText === 'textarea.editor' ) {
		if ( window.mozInnerScreenX ) { /* firefox hacky detection */
		    rule.style.padding = "3px 0px";
		}
		else {
		    rule.style.padding = "2px 1px";
		}
	    }
	}
    };


    this.ui_transform = function(text) {
	return text.replace(/^id_pk$/, 'ID').replace('_', ' ');
    };


    this.ui_width = function(field) {
	return field.width_default ? field.width_default : CELL_WIDTH_DEFAULT;
    };


    this.to64 = function(s) {
	return (new Buffer(s)).toString('base64');
    };

    this.linkify = function(s) {
	return s.replace(/(https?:\/\/[\S]+)/ig, '<a href="$1" target="_blank">$1</a>');
    }

    /* URI encoding breaks many API searches */
    this.remove_URI_encoded = function(s) {
	return s.replace(/%[0-9A-F][0-9A-F]/gi, '');
    }


    this.create_get_encoding = function(dict) {
	var url_params = '';
	for ( k in dict ) {
	    var prefix = url_params == '' ? '?' : '&';
	    url_params += prefix + k + '=' + dict[k];
	}
	return url_params;
    };

    
    this.parse_form_encoding = function(str) {
	var params = str.split('&');
	kv = {};
	for ( var i = 0; i < params.length; i++ ) {
	    var keyval = params[i].split('=');
	    var key = keyval[0];
	    var val = keyval[1];
	    kv[key] = val;
	}
	return kv;
    };
    
    this.session_key_new = function() {
	return crypto.randomBytes(32).toString('hex');
    };
    
    this.validation_token_new = function() {
	// don't exceed column width in DB of 63
	return crypto.randomBytes(31).toString('hex');
    };

    this.uuid_new = function() {
	// imitate iOS
	return (crypto.randomBytes(4).toString('hex') + '-'
		+ crypto.randomBytes(2).toString('hex') + '-'
		+ crypto.randomBytes(2).toString('hex') + '-'
		+ crypto.randomBytes(2).toString('hex') + '-'
		+ crypto.randomBytes(6).toString('hex')).toUpperCase();
    };

    this.fake_random_hexbytes = function(nBytes) {
	var res = '';
	for ( var i = 0; i < nBytes * 2; i++ ) {
	    res += (Math.floor(Math.random() * 16)).to_hex_nibble();
	}
	return res;
    }

    this.uuid_new_fake = function() {
	// imitate iOS
	return (this.fake_random_hexbytes(4) + '-'
		+ this.fake_random_hexbytes(2) + '-'
		+ this.fake_random_hexbytes(2) + '-'
		+ this.fake_random_hexbytes(2) + '-'
		+ this.fake_random_hexbytes(6)).toUpperCase();
    };
    
    return this;
};

exports.utilities = new Utilities();


D.log('loaded ' + __filename);
