/*
  debugger.js

  Copyright General Enchantment LLC / BaseZen Consulting Inc. All Rights Reserved.
  Author: Daniel Brobmerg, BaseZen Consulting Inc.
*/ 

console.log('loading ' + __filename);


/* Bootstrapping Number & Date extensions. Put here to prevent
 * debugger's dependency on anything but Node built-ins. Hence all
 * other modules can 'require' it. */
/* Number extensions */
Number.prototype.format = function(num_digits) {
    var s = '' + this;
    for ( var i = s.length; i < num_digits; i++ ) {
	s = '0' + s;
    }
    return s;
};

Number.prototype.to_hex_nibble = function() {
    var hexChar = ['0', '1', '2', '3', '4', '5', '6', '7','8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];
    return hexChar[this & 0x0f];
};

Number.prototype.to_hex = function() {
    var hexChar = ['0', '1', '2', '3', '4', '5', '6', '7','8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];
    return hexChar[(this >> 4) & 0x0f] + hexChar[this & 0x0f];
};

Date.iso_now = function() {
    return (new Date()).iso_timestamp();
};

Date.prototype.iso_timestamp = function() {
    return this.iso_date() + ' ' + this.iso_time();
};

Date.prototype.iso_date = function() {
    return this.getFullYear() + '-' + (this.getMonth() + 1).format(2) + '-' + this.getDate().format(2);
};
  
Date.prototype.iso_time = function() {
    return this.getHours().format(2) + 
	':' + this.getMinutes().format(2) + 
	':' + this.getSeconds().format(2);
};

Date.days = [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];
Date.months = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];


var path = require('path');
var posix = require('posix');

var err_offset = typeof navigator !== 'undefined' && navigator.userAgent.match(/Safari/) ? 1 : 2;

var debugger_class = function() {
    let self = this;
    
    self.reset_syslog = function() {
	if ( posix ) { // only on server
	    var logname = process.env.BEEBOARD_CODEBASE === 'unstable' ? 'beeboard-dev' : 'beeboard';
	    posix.closelog();
	    posix.openlog(logname, {odelay: true, pid: true}, 'daemon');
	}
    };

    self.reset_syslog();
    self.inserted = false;

    self.log_message = function(str, level) {
	var lev = level ? level : "debug";

	// Allow for the possibility that data has been logged before we were able to manipulate DOM
	if ( typeof('document') === 'object' && !self.inserted && document.readyState === 'complete' ) {
	    self.debug_area.appendTo($('<div>').addClass('debug').appendTo($('#content')));
	    self.inserted = true;
	}

	var fake_e = new Error();
	var err_info = fake_e.stack.split('\n');
	var stack_entry = err_info[err_offset]; // Chrome: Line 0 is "Error", 1 is this function; Safari: Line 0 is this function
	var ts = Date.iso_now();
	var func, url, file, line_number, column_number;

	if ( !stack_entry ) {
	    console.log("Unable to debug this message");
	    return;
	}
	// Chrome:
        // "   at https://domainname.tld/js/factory.js:149:3"                           Separate javascript file, toplevel
        // "   at cache.(anonymous function) (https://domainname.tld/js/status.js:3:7)" Anonymous function
        // "   at cache.(anonymous function).structure_arrived (https://domainname.tld/js/records.js:41:4) 
        // "   at new cache.(anonymous function) (https://domainname.tld/js/table/calc_fields.js:39:4) 
        // "   at HTMLDocument.<anonymous> (https://domainname.tld/?debug=true:15:11)"  Embedded Script
	// "   at get_object (https://domainname.tld/js/factory.js:52:5)"               Separate javascript file, in func
        // "   at Object.eval [as success] (https://domainname.tld/js/table/model.js:142:12)
	var parts = stack_entry.match(/^    at ((.+) \()?(https:\/\/.*\/)?([^:]+):([^:]+):([^)]+)\)?$/);

	// Safari:
	// "global code@https://appserver.beeboard.io/Storage/Retrieve?FileName=lib/debugger.js:268:38"
	// "https://appserver.beeboard.io/Storage/Retrieve?FileName=client.js:34:7"
	if ( !parts ) {
	    parts = stack_entry.match(/^((.+)@?)(https:\/\/.*\/)?([^:]+):([^:]+):([^)]+)$/);
	}

	if ( !parts || parts.length < 3 ) {
	    console.log("Unrecognized log format");
	    return;
	}

	var trace = parts[2];
	var url = typeof(parts[3]) === 'string' ? parts[3] : '';
	var file = path ? path.basename(parts[4]) : parts[4];
	var line_number = parts[5];
	var column_number = parts[6];
	if ( typeof trace === 'undefined' ) {
	    func = '<toplevel>';
	}
	else if ( trace.match(/^new /) ) {
	    func = '<new>';
	}
	else if ( (parts = trace.match(/\(anonymous function\)(\S*\.([^.]+))?$/)) ) {
	    func = (typeof parts[2] === 'undefined') ? '<anonymous>' : parts[2];
	}
	else if ( (parts = trace.match(/^HTMLDocument\.(\S+)$/)) ) {
	    func = 'html.' + parts[1];
	}
	else if ( (parts = trace.match(/^(\S+)$/)) ) {
	    func = parts[1];
	}
	else if ( (parts = trace.match(/^\S+ \[as (\S+)\]$/)) ) {
	    func = '<callback ' + parts[1] + '>';
	}

	var syslog_prefix = url + file + ':' + line_number + ':' + column_number + ' (' + func + ')';
	if ( posix && self.use_syslog ) {
	    lines = (syslog_prefix + ' ' + str).split("\n");
	    for ( var i = 0; i < lines.length; i++ ) {
		posix.syslog(lev, lines[i]); // syslog does not handle linebreaks nicely, showing up as '#012'
	    }
	}
	else {
	    var console_prefix = ts + ' ' + syslog_prefix;
	    console.log(console_prefix + ' ' + str);
	}

	return self;
    }


    /* shallow dump of immediate properties only */
    self.sdump = function(o) {
	var text = 'Type: ' + typeof(o) + ': ';
	for ( var p in o ) {
	    if ( typeof(o[p]) === 'function' ) {
		continue;
	    }
	    if ( typeof(o[p]) === 'object' ) {
		text += p + ': [object]\n';
	    }
	    else {
		text += p + ': ' + o[p] + '\n';
	    }
	}
	return text;
    };


    /* full recursive dump with loop detection */
    self.dump = function(obj, inherited) {
	self.object_cache = [ ];
	self.object_count = 0;
	return self.dump_helper(obj, 0, inherited, true);
    };


    /* full recursive dump but fold output into one line (for small objects) */
    self.ldump = function(obj) {
	self.object_cache = [ ];
	self.object_count = 0;
	return self.dump_helper(obj, 0, false, false);
    };


    /* TODO: This doesn't work on non-empty arrays */
    self.dump_helper = function(obj, level, inherited, newlines) {
	if ( level > 15 ) { return '[DEPTH]'; }
	/* JavaScript can only allow numbers and strings as property
	   names in its associative arrays, hence we cannot hash
	   objects in them. We need an external library to do this
	   efficiently, which is suckitocious. */
	if ( self.object_cache.indexOf(obj) !== -1 ) {
	    return '<' + typeof(obj) + ' ref ' + self.object_cache.indexOf(obj) + '>';
	}

	if ( typeof(obj) === 'object' ) {
	    if ( obj === null ) {
		return 'null'; /* Bug in current JS engine */
	    }
	    self.object_cache[++self.object_count] = obj;
	    var header = 'object ' + self.object_count + ':';

	    var padding = '';
	    for ( var j = 0; j < level; j++ ) {
		padding += '    ';
	    }

	    var max_length = Math.round(Math.pow(2, 16 - level));
	    var value_text = '';
	    // TODO: Needs to be implemented for arrays as well
            for ( var key in obj ) {
		if ( !inherited && !Object.prototype.hasOwnProperty.call(obj, key) ) {
		    continue;
		}
		var value;
		try {
		    value = obj[key];
		}
		catch ( err ) {
		    value = '[[Exception: ' + err + ']]';
		}
		/* 
		   if ( value === '' || value === false || value === 0 || value === null ) { // TODO make 'false' fields optional
		     continue;
		   }
		*/
		if ( typeof(value) === 'function' ) {
		    continue;
		}
		if ( (key === 'target' || key === 'dropZone' || key === 'pasteZone' || key === 'ownerDocument') 
		     && typeof(value) === 'object' ) {
		    value = '[DOM ref]';
		}
		if ( newlines ) {
		    value_text += '\n' + padding + '    ';
		}
		else {
		    value_text += ' ';
		}
		value_text += '[' + self.dump_helper(key, level + 1, inherited) + '] ' 
		    + self.dump_helper(value, level + 1, inherited);
		if ( value_text.length > max_length ) {
		    value_text = value_text.substring(0, max_length) + '...<truncated>';
		    break;
		}
            }

	    if ( value_text === '' ) {
		try {
		    // TO DO: Improve for arrays with a real loop
		    if ( typeof obj.toString == 'function' ) {
			if ( obj instanceof Array ) {
			    return '[' + obj.toString() + ']';
			}
			else {
			    return obj.toString();
			}
		    }
		    else {
			return '[mystery Obj]';
		    }
		} catch ( e ) {
		    return '[unprintable Obj]';
		}
		return header + ' <empty>';
	    }
	    return header + value_text;
	}
	else if ( typeof(obj) === 'function' ) {
	    return 'function';
	}
	else if ( typeof(obj) === 'string' ) {
	    return '\'' + obj + '\'';
	}
	return '' + obj;
    }; /* function dump_helper() */

    if ( typeof(location) === 'undefined' ) { // server-side
	self.log = self.log_message;
	self.log('console/server debugging enabled');
    }
    else if ( typeof(location) === 'object' && location.href.indexOf('debug') !== -1 ) {
	self.debug_area = $('<textarea>', { readonly: "readonly", id: "debug" }).addClass('debug');
	self.log = self.log_message;
	self.log('browser/client debugging enabled');
    }
    else {
	self.log = self.log_message;
	self.log('console/unknown debugging enabled');
    }

    return self;
}

exports.debugger = new debugger_class();
exports.debugger.use_syslog = (typeof process !== 'undefined');
exports.debugger.log('using syslog: ' + exports.debugger.use_syslog);
exports.debugger.log('loaded ' + __filename);
