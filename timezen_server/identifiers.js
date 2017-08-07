/*
  identifers.js

  Constants shared by UI and server (NetworkIdentifers.swift on client)

  Copyright General Enchantment LLC / BaseZen Consulting Inc. All Rights Reserved.
  Author: Daniel Brobmerg, BaseZen Consulting Inc.
*/

var cfg = require('./config.js');
var D   = require(cfg.LIB + 'debugger.js').debugger;
D.log('loading ' + __filename);


exports.identifiers = {
    DBState: {
	CONNECTING: 'Connecting',
	CONNECTED: 'Connected',
	DISCONNECTING: 'Disconnecting',
	DISCONNECTED: 'Disconnected'
    },
    

    Sources: {
	InternalApp:   'InternalApp',
	Network:       'Network',
	UserInterface: 'UserInterface',
    },


    StorageKeys: {
	FileName:          'FileName',
    },


    MessageClasses: {
    },

    
    /* Message structure. Every message has a MessageClass value and a Message value 
       and we dispatch from there. */
    MessageKeys: {
	Class:     'MessageClass', // e.g. collection change
	Action:    'Action',       // e.g. add, remote, update
	Entity:    'Entity',       // e.g. Account, Medianode
	Value:     'Value',
    },


    ControlActions: {
	Telemetry:         'Telemetry',
	Stats:             'Stats', 
	AsyncError:        'AsyncError',
	Heartbeat:         'Heartbeat',
	ClearCache:        'ClearCache',
	ActiveSessionsChanged: 'ActiveSessionsChanged',
    },

    
    Entities: {
    },

    
    Relationships: {
    },
    

    AccountActions: {
	SignUp:               'SignUp',
	Validate:             'Validate',
	FacebookLogin:        'FacebookLogin',
	Login:                'Login',
	Logout:               'Logout',
	ChangePassword:       'ChangePassword',
	RequestPasswordReset: 'RequestPasswordReset',
	ConfirmPasswordReset: 'ConfirmResetPassword',
    },
	

    SessionActions: {
    },
    
	
    /* Keys that apply to many/most DB objects */
    EntityKeys: {
	UUID:              'UUID',
	DisplayName:       'DisplayName',
	CreationDate:      'CreationDate',
	ModificationDate:  'ModificationDate',
    },
    

    /* All parameter names within the '/auth/' endpoint namespace */
    AccountKeys: { // Used in the /auth endpoint category
	Email:           'Email',
	FirstName:       'FirstName',
	LastName:        'LastName',
	Password:        'Password',
	NewPassword:     'NewPassword', // for ChangePassword only
	MatchString:     'MatchString', // for searches only (SearchAccount action)
	SessionKey:      'SessionKey',
	NotificationFlags:'NotificationFlags',
	Validated:       'Validated',
	ValidationToken: 'ValidationToken',
	FacebookToken:   'FacebookToken',
    },
    

    HTTPHeaderKeys: {
	Cookie: 'cookie',
    },
    

    /* Structure of all HTTP/REST (non-websocket) requests */
    ResponseKeys: {
	Info:          'Info',
	Result:        'Result',
	Success:       'Success',
	ErrorMessage:  'ErrorMessage',
	MediaURL:      'MediaURL',
    },

    
    ModuleMessages: {
	SocketClosed: 'Error: This socket is closed.', /* As set by NodeJS Socket library */
    },
};

var I = exports.identifiers;

D.log('loaded ' + __filename);
