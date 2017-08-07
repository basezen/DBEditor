/*
  httpio.js

  Common facilities to prepare HTTP output, particularly JSON, in support of the REST server.

  Copyright 2017 BaseZen Consulting Inc. All Rights Reserved.
  Author: Daniel Bromberg, BaseZen Consulting Inc.
*/

var cfg         = require('./config.js');
var D           = require(cfg.LIB + 'debugger.js').debugger;
D.log('loading ' + __filename);

var C           = require(cfg.LIB + 'constants.js');
var util        = require(cfg.LIB + 'utilities.js').utilities;

var identifiers = require('./identifiers.js').identifiers;

var MessageClasses = identifiers.MessageClasses;
var ControlActions = identifiers.ControlActions;
var ResponseKeys   = identifiers.ResponseKeys;
var MessageKeys    = identifiers.MessageKeys;


exports.report_error = function(result_stream, error_message, http_error_code) {
    // TODO: Teach client connectionManager to look for ResponseKeys.ErrorMessage
    var err_response = {[ResponseKeys.Success]: false, [ResponseKeys.ErrorMessage]: error_message };
    if ( result_stream.is_websocket ) {
	result_stream.websocket_write({ [MessageKeys.Class]: MessageClasses.Server,
					[MessageKeys.Action]: ControlActions.AsyncError,
					[MessageKeys.Value]: error_message });
    }
    else {
	http_error_code = http_error_code ? http_error_code : C.HTTP_BAD_REQUEST;
	var responder = exports.make_responder(util.to_mime('.json'), result_stream);
	responder(err_response, null, http_error_code);
    }
};


exports.make_responder = function(mime_info, result_stream, request_headers) {
    var responder = function(results, headers, http_code) {
	http_code = http_code ? http_code : C.HTTP_OK;
	headers = headers ? headers : {};
	if ( mime_info.mime.indexOf('application/json') === 0 ) {
	    results = JSON.stringify(results);
	}
	headers['Access-Control-Allow-Origin'] = request_headers !== undefined && request_headers['origin'] !== undefined ? request_headers['origin'] : "*";
	headers['Access-Control-Allow-Credentials'] = "true";
	headers['Access-Control-Allow-Methods'] = "GET, POST, PUT, OPTIONS";
	headers['Access-Control-Allow-Headers'] = "Authorization, Content-Type";
	headers['Content-Length'] = mime_info.encoding === 'binary' ? results.length : Buffer.byteLength(results, 'utf8');
	if ( results.length > 0 ) {
	    headers['Content-Type'] = mime_info.mime;
	}
	D.log('responding, HTTP code: ' + http_code + ' length: ' + headers['Content-Length']);
	if ( mime_info.encoding != 'binary' ) {
	    D.log('payload: ' + results.substring(0, 128).replace(/\n/g, '\\n'));
	}
	result_stream.writeHead(http_code, headers);
	result_stream.write(results, mime_info.encoding);
	result_stream.end();
    };
    responder.rs = result_stream;
    return responder;
};


D.log('loaded ' + __filename);
