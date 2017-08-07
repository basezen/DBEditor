/*
  constants.js
  Values that are true across all Node projects, such as universal math & stable protocol values

  Copyright General Enchantment LLC / BaseZen Consulting Inc. All Rights Reserved.
  Author: Daniel Brobmerg, BaseZen Consulting Inc.
*/

var D = require('./debugger.js').debugger;
D.log('loading ' + __filename);

/* TODO: (Long-term) carve out this namespace into subparts as unrelated groupings grow */
module.exports = {
    /* Immutable constants */
    GIGABYTE: 1024 * 1024 * 1024,
    MEGABYTE: 1024 * 1024,
    KILOBYTE: 1024,

    SEC_TO_MSEC: 1000,
    HOURS_TO_SEC: 3600,
    DAYS_TO_SEC: 3600 * 24,
    WEBSOCKET_MAGIC_APPEND: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',

    /* Despite the column numbering in https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers,
       bit indices run left to right --> high to low */
    WEBSOCKET_FIN_BIT:       0x80,
    WEBSOCKET_OPCODE_MASK:   0x0F,
    WEBSOCKET_OPCODE_TEXT:   0x01,
    WEBSOCKET_OPCODE_BINARY: 0x02,
    WEBSOCKET_OPCODE_CLOSE:  0x08,
    WEBSOCKET_OPCODE_PING:   0x09,
    WEBSOCKET_OPCODE_PONG:   0x0A,
    
    HTTP_OK: 200,
    HTTP_REDIRECT_RANGE_START: 300,
    HTTP_REDIRECT_TEMPORARY: 307,
    HTTP_REDIRECT_RANGE_END: 308,
    HTTP_BAD_REQUEST: 400,
    HTTP_UNAUTHORIZED: 401,
    HTTP_NOT_FOUND: 404,
    HTTP_INTERNAL_ERROR: 500,
    HTTP_UNAVAILABLE: 503,
};

D.log('loaded ' + __filename);
