/*
  config.js

  Admin-editable server settings

  Copyright General Enchantment LLC / BaseZen Consulting Inc. All Rights Reserved.
  Author: Daniel Brobmerg, BaseZen Consulting Inc.
*/

console.log('loading ' + __filename);

var OS = require('os');

module.exports = {
    /* Highly stable */
    SESSION_COOKIE_KEY_NAME: 'LOGIN_SESSION_KEY',

    /* Local deployment configuration */
    MYSQL_DEV_PARAMS: {
	host: 'localhost',
	user: 'beeboard',
	password: 'b771>beb2C$',
	database: 'beeboard',
	ssl: {
	    key_SOURCE: './ssl/mysql-client-key.pem',
	    ca_SOURCE: './ssl/mysql-selfsigned-certificate-authority.pem',
	    cert_SOURCE:'./ssl/mysql-signed-client-certificate.pem'
	},
    },
    
    MYSQL_LIVE_PARAMS: {
	host: 'localhost',
	user: 'beeboard',
	password: 'b771>beb2C$',
	database: 'beeboard',
	ssl: {
	    key_SOURCE: '/bb/server/ssl/mysql-client-key.pem',
	    ca_SOURCE: '/bb/server/ssl/mysql-selfsigned-certificate-authority.pem',
	    cert_SOURCE:'/bb/server/ssl/mysql-signed-client-certificate.pem'
	},
    },

    /* Not sure why this throws an exception off-thread, but it must be caught and recrapulated */
    MYSQL_STUPID_EXCEPTION: "Backend error: Error: Cannot enqueue Query after invoking quit.",

    /* Module tunable constants */
    DB: {
	TIMEOUT_SEC: 5, /* Optimize for user responsiveness */
	KEEPALIVE_INTERVAL_SEC: 60,
	KEEPALIVE_TIMEOUT_SEC: 30
    },
    DEFAULT_FRIEND_PUBLISH_NOTIFY : 1,
    DEFAULT_ADMIN_PUBLISH_NOTIFY : 2,
    MAX_MESSAGE_LENGTH: 65535, /* Assumption is no binary data (images/videos) over this
				* channel; have an Object Server for that if need be */

    /* Project-wide deployment configuration */
    LIB: './lib/',
    /* Azure / MS virtual container defines process.env.port as some Microsofty thing, otherwise use normal system-wide TCP */
    HOST: OS.hostname(),
    PROTOCOL: 'https',
//    HTTPS_PORT: process.env.PORT ? process.env.PORT : (process.env.BEEBOARD_CODEBASE == 'unstable' ? 8443 : 443),
HTTPS_PORT: 443,
    UPLOAD_DIR: 'upload',

    FACEBOOK_APP_SECRET: 'f20d5030409e6db1004ce83201a13ca1',

    Email: {
	ADMIN_SENDER: 'BeeBoard <accounts@beeboard.io>',
	WELCOME_SUBJECT: 'Welcome to BeeBoard. Please verify your email',
    },

    OperationMode: OS.hostname().match(/^beta/) ? 'beta' : 'production',
};


console.log('loaded ' + __filename);
