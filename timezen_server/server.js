#!/usr/bin/node

/*
  server.js

  Main entry point to the BeeBoard Server
  
  Copyright 2017 BaseZen Consulting Inc. All Rights Reserved.
  Author: Daniel Bromberg, BaseZen Consulting Inc.
*/

var cfg              = require('./config.js');
var D                = require(cfg.LIB + 'debugger.js').debugger;
D.log('loading ' + __filename);

process.on('SIGUSR2', function() {
    D.log('LOG RESET -- End of old log file');
    D.reset_syslog();
    D.log('LOG RESET -- Beginning of new log file');
});
process.on('SIGHUP',  function() { clear_all_client_webcaches(); });
process.on('SIGINT',  function() { full_state_reset(); });
process.on('SIGQUIT', function() { shutdown_entire_server('Quit');      });
process.on('SIGTERM', function() { shutdown_entire_server('Terminate'); });


/* 3rd party modules -- Node standard */
var https            = require('https');
var http             = require('http');
var fs               = require('fs');
var path             = require('path');

/* Local modules */
require(cfg.LIB + 'extensions.js');
var C                = require(cfg.LIB + 'constants.js');
var util             = require(cfg.LIB + 'utilities.js').utilities;

var httpio           = require('./httpio.js');
var mailer           = require('./mailer.js');
var DB               = require('./db.js').DB;
var identifiers      = require('./identifiers.js').identifiers;


/* Convenience globals */
var DBState          = identifiers.DBState;
var EmailBody        = identifiers.EmailBody;
var MessageClasses   = identifiers.MessageClasses;
var ControlActions   = identifiers.ControlActions;
var StorageKeys      = identifiers.StorageKeys;
var Entities         = identifiers.Entities;

/* Do AFTER all "require"s so interpreter can give helpful parse errors on included modules */
function handle_runtime_exceptions() {
    process.on('uncaughtException', function(err) {
	if ( err.rs ) {
	    if ( err.message === cfg.MYSQL_STUPID_EXCEPTION ) {
		D.log('Ignoring stupid MySQL shutdown exception');
		return;
	    }
	    var http_code = err.http_code ? err.http_code : C.HTTP_BAD_REQUEST;
	    D.log('Normal exception, sending to client: ' + err.message + ' code: ' + http_code)
	    httpio.report_error(err.rs, err.message, http_code);
	}
	else if ( err.message && err.stack ) {
	    if ( err.message.match(/^ENOENT/) ) {
		D.log('SERIOUS ERROR: File not found when it should be continuing anyway: ' + err.message + err.stack);
		return;
	    }
	    if ( err.message.match(/ECONNRESET/) || err.message.match(/Connection lost/) ) {
		D.log('Database informed us connection lost, attempting restore');
		global.DB.request_reset();
		return;
	    }
	    if ( err.message.match(/write after end/) ) {
		D.log('Client hung up prematurely, ignoring');
		return;
	    }
	    if ( err.message.match(/require_secure_transport=ON/) ) {
		D.log('Security was forced but we do not seem to have it, attempting re-connect while admin fixes this setting');
		global.DB.request_reset();
		return;
	    }
	    shutdown_entire_server('Uncaught internal exception: ' + err.message + '\nStack:\n' + err.stack);
	}
	else {
	    shutdown_entire_server('Uncaught library exception: ' + D.dump(err));
	}
    });
}


function init_globals(completion) {
    Request_Handlers = { };
    D.log('Entities: ' + D.dump(identifiers.Entities));
    for ( var e_key in identifiers.Entities ) {
	if ( e_key === identifiers.Entities.NodePath ) {
	    continue;
	}
	var entity = identifiers.Entities[e_key];
	D.log('entity: ' + entity);
	var source_file = './' + entity.toLowerCase() + '_ops.js';
	D.log('requiring ' + source_file);
	Request_Handlers[entity] = require(source_file);
    }
    
    // DO NOT do any more 'require'ing after this point; syntax errors will be lost if handled by this
    handle_runtime_exceptions();

    // Immutable
    global.Server_Port = cfg.HTTPS_PORT;
    global.Server_URL  = cfg.PROTOCOL + '://' + cfg.HOST 
	+ (Server_Port !== 80 ? (':' + Server_Port) : '') + '/';
    
    reset_memory_state(completion);
}


function reset_memory_state(completion) {
    var async_completions = 0;
    var async_completions_waiting = 0; // TODO: Determine this programatically;

    function async_completed() {
	async_completions += 1;
	D.log("completions: " + async_completions + " out of " + async_completions_waiting);
	if ( async_completions == async_completions_waiting ) {
	    completion();
	}
    }
    
    global.Account    = { }; // Built dynamically as account logs in & App looks them up in DB
    global.Media_Node = { }; // Master table so we know if a publishing represents new or changed
    global.Session    = { };
    global.Email      = { };
    global.DB         = new DB();

    // Rely on caching behavior to initialize this into global.Media_Node for future fast lookup by all users
    async_completions_waiting++;
    fs.readFile('./ssl/dkim-private-key.pem', function(read_err, file_buf) {
	if ( read_err ) {
	    D.log('ERROR! Cannot read file: ' + read_err);
	    async_completed();
	    return;
	}
	mailer.init(file_buf);
	async_completed();
    });
	    
    for ( var template_key in EmailBody ) {
	async_completions_waiting++;
	(function(filename_capture) {
	    fs.readFile(filename_capture, 'utf8', function(read_err, file_buf) {
		if ( read_err ) {
		    D.log('ERROR! Cannot read file: ' + read_err);
		    async_completed();
		    return;
		}
		global.Email[filename_capture] = file_buf;
		D.log('Set global.Email[' + filename_capture + '] to ' + file_buf.length + ' chars');
		async_completed();
	    });
	})(EmailBody[template_key]);
    };

    global.DB.request_connect();
}


function full_state_reset() {
    D.log('FULL STATE RESET -- Begin');
    for ( var skey in global.Session ) {
	var session = global.Session[skey];
	if ( !session.socket ) {
	    D.log('session ' + skey + ' has an undefined socket');
	    continue;
	}
	D.log('FULL STATE RESET -- Shutting down ' + session.socket.details());
	session.socket.end();
    }
    reset_memory_state(function() {
	D.log('FULL STATE RESET -- End');
    });
}


function clear_all_client_webcaches() {
    D.log('CLEAR ALL CLIENT CACHES -- Begin');
    for ( var skey in global.Session ) {
	var session = global.Session[skey];
	if ( !session.socket ) {
	    D.log('session ' + skey + ' has an undefined socket');
	    continue;
	}
	session.socket.websocket_write({ [MessageKeys.Class] : MessageClasses.Server,
					 [MessageKeys.Action]: ControlActions.ClearCache });
    }
}


function validate(entity, action, request_headers, params, response_stream) {
    var file_name = params ? params[StorageKeys.FileName] : null;
    var allowed_files = {
	'resources/jquery.js'           : true,
	'resources/nodeshim.js'         : true,
	'resources/client.js'           : true,
	'resources/password_reset.js'   : true,
	'resources/legal_agreement.html': true,
	'resources/client.html'         : true,
	'resources/password_reset.html' : true,
	'identifiers.js'                : true,
	'lib/debugger.js'               : true,
	'lib/extensions.js'             : true,
	'lib/utilities.js'              : true,
    };

    if ( (entity === Entities.Account && (action === AccountActions.Login || 
					  action === AccountActions.FacebookLogin ||
					  action === AccountActions.SignUp ||
					  action === AccountActions.ConfirmPasswordReset ||
					  action === AccountActions.RequestPasswordReset ||
					  action === AccountActions.Validate) ) ||
	 (entity === Entities.App && (action === AppActions.CreateBulletin) ) ||
	 (entity === Entities.Storage && 
	  action === StorageActions.Retrieve
	  /* sort of temporary to allow e-mails to be previewed by dev team w/o logging on  */
	  && (allowed_files[file_name] || file_name.match(/^templates\/email\/.*\.html/))) ) {
	return true;
    }

    for ( var header_key in request_headers ) {
	// old login check through cookie
	if ( header_key.toLowerCase() === 'cookie' ) { 
	    // D.log("cookie header: " + request_headers[header_key]);
	    var cookie_crumbs = request_headers[header_key].match(/LOGIN_SESSION_KEY=([^;]+)/);
	    if ( !cookie_crumbs || cookie_crumbs.length !== 2 ) {
		return false;
	    }
	    var session_key_value = cookie_crumbs[1];
	    D.log('extracted cookie: ' + session_key_value);
	    var session = global.Session[session_key_value];
	    if ( !session ) {
		return false;
	    }
	    // TODO: validate session object
	    return session;
	}
	// new login check through login_session_key header :done by I.Kunovskiy
	else if ( header_key.toLowerCase() === 'authorization' ) { 
	    // D.log("custom header: " + request_headers[header_key]);
	    var session_key_value = request_headers[header_key];
	    var session = global.Session[session_key_value];
	    if ( !session ) {
		return false;
	    }
	    // TODO: validate session object
	    return session;
	}
    }
    return false;
}


function handle_http_request(request, response_stream) {
    if ( global.DB.shutting_down ) {
	response_stream.end(); // A bit obnoxious, but we're supposed to be shutting down instantly
	D.log("Rejected request: " + request.url + " during shutdown.");
	return;
    }
    var url_pieces = request.url.split('?');
    var url_path = url_pieces[0];
    D.log('AURL ' + request.url);
    var params_get = url_pieces.length > 1 ? util.parse_form_encoding(url_pieces[1]) : [];
    for ( param_key in params_get ) {
	params_get[param_key] = decodeURIComponent(params_get[param_key]);
    }

    var endpoint_path = url_path.split('/');
    var entity = endpoint_path[1];
    var action = endpoint_path[2];
    var session = null;
    
    if ( entity === 'favicon.ico' ) { // Silently discard browser annoyance
	httpio.report_error(response_stream, 'I hate icons', C.HTTP_NOT_FOUND);
	return;
    }
    
    D.log('Received entity: "' + entity + '", action: "' + action + '" params: "' + D.dump(params_get) + '"');
    
    if ( !(session = validate(entity, action, request.headers, params_get, response_stream)) ) {
	throw { rs: response_stream, message: 'Unauthorized request', http_code: C.HTTP_UNAUTHORIZED };
    }

    if ( session.account ) {
	D.log('authorized account: ' + session.account[AccountKeys.Email]);
    }

    /* Dispatch section */
    var entity_dict, handling_func;
    if ( !(entity_dict = Request_Handlers[entity]) ) {
	throw { rs: response_stream, message: 'Unknown entity: ' + entity };
    }
    if ( !(handling_func = entity_dict[action]) ) {
	throw { rs: response_stream, message: 'Unknown action: ' + action + ' for entity: ' + entity };
    }

    var responder_mime_type = entity == 'App' ? util.to_mime('.html') : util.to_mime('.json');
    var responder = httpio.make_responder(responder_mime_type, response_stream, request.headers);
    handling_func(session, request.headers, params_get, responder);
}


function shutdown_entire_server(reason) {
    console.log('SERVER TERMINATING due to: ' + reason);

    if ( global.keepAliveTask ) {
	clearInterval(global.keepAliveTask);
    }
    
    if ( global.DB ) {
	global.DB.request_shutdown();
    }

    if ( server ) {
	console.log('Shutting down server listener.');
	for ( var key in global.Session ) {
	    var session = global.Session[key];
	    if ( session.socket ) {
		D.log("ending session: " + session.key + " socket: " + session.socket.details());
		session.socket.end();
	    }
	}
	server.unref(); // Lets the program exit; TODO is it necessary if process.exit is explicit?
	server.close(function() {
	    console.log('Shut down confirmed.');
	    process.exit();
	});
	process.exit();
	console.log('Server close request complete.');
    }

    console.log('shutdown request submitted');
}


/** MAIN **/
D.log('starting with configuration: ' + D.dump(cfg));
util.write_pidfile();

var server = null;
const tls_options = {
    key:  fs.readFileSync('ssl/' + cfg.OperationMode + '-server-key.pem'),
    cert: fs.readFileSync('ssl/' + cfg.OperationMode + '-server-cert.pem')
};
on_init_done = function() {
    server = https.createServer(tls_options, handle_http_request);
    D.log('Created HTTPS listening socket');
    server.on('upgrade', function(request, socket, head) {
	D.log('websocket requested with Headers: ' + D.dump(request.headers) + ' on Socket: ' + socket.details());
	var session;
	if ( !(session = validate(null, null, request.headers)) ) {
	    socket.write('HTTP/1.1 401 Authorization required\r\n\r\n');
	    socket.end(); // TODO correct, or does client close automatically?
	    return;
	}
	session.make_streaming(request.headers, socket);
    });
    
    var res = server.listen(global.Server_Port);

    D.log('Ready for requests on port ' + global.Server_Port);
};


init_globals(on_init_done);


D.log('loaded ' + __filename);
