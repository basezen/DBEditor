var cfg = require('./config.js');
var D = require(cfg.LIB + 'debugger.js').debugger;
D.log('loading ' + __filename);

var fs             = require('fs');
var mysql          = require('mysql');
var make_uuid      = require('uuid').v1;

var C = require(cfg.LIB + 'constants.js');

var identifiers    = require('./identifiers.js').identifiers;

var State          = identifiers.DBState;
var BeeBoard       = identifiers.BeeBoard;
var EntityKeys     = identifiers.EntityKeys;
var AccountKeys    = identifiers.AccountKeys;
var MediaNodeKeys  = identifiers.MediaNodeKeys;
var MembershipKeys = identifiers.MembershipKeys;
var MediaNodeEntitiesEnum = identifiers.MediaNodeEntitiesEnum;

// TODO: Add scheduling capability to bulletins by associating them with a schedule object (design? underconstrained)

/* 'remove' for all entities never actually removes, only marks with a deletion time; TODO: query deleted item types
   Associations *are* actual deletes; they're just a linkage */
var SQL = {
    make_uuid: 'SELECT UUID() as uuid',

    /* ACCOUNT operations */
    create_unvalidated_account: 'INSERT INTO account (uuid_bin, modified, first_name, last_name, email, password,'
	+ ' validation_token) VALUES (uuid_to_bin(?), NOW(), ?, ?, ?, ?, ?)',

    lookup_unvalidated_account: 'SELECT uuid_from_bin(uuid_bin) AS uuid,'
	+ ' validated FROM account WHERE `email` = ? AND `validation_token` = ?',

    validate_account: 'UPDATE account SET validated = true WHERE uuid_bin = uuid_to_bin(?)',

    set_validation_token: 'UPDATE account SET validation_token = ? where uuid_bin = uuid_to_bin(?)',

    set_password_hash_and_reset_token: 'UPDATE account SET password = ?, validation_token = \'consumed\' WHERE uuid_bin = uuid_to_bin(?)',

    lookup_account: 'SELECT uuid_from_bin(uuid_bin) AS uuid, email,'
	+ ' password, validated, notification_flags, first_name, last_name, created, modified FROM account WHERE uuid_bin = uuid_to_bin(?)',

    lookup_account_by_email: 'SELECT uuid_from_bin(uuid_bin) AS uuid,'
	+ ' password, validated, validation_token, notification_flags, first_name, last_name, created, modified FROM account WHERE email = ?',

    search_accounts: 'SELECT uuid_from_bin(uuid_bin) AS uuid, first_name, last_name, email FROM account WHERE'
	+ ' (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?) AND deleted IS NULL AND validated IS TRUE',

    set_notification_flags: 'UPDATE account SET notification_flags = ? WHERE uuid_bin = uuid_to_bin(?)',
    
    change_password: 'UPDATE account SET password = ? WHERE uuid_bin = uuid_to_bin(?)',
    
    remove_account: 'UPDATE account SET deleted = NOW() WHERE uuid_bin = uuid_to_bin(?) AND deleted is NULL',

    invite_by_email: 'INSERT INTO invitation (inviter_uuid_bin, invitee_email, modified)'
	+ ' VALUES (uuid_to_bin(?), ?, NOW())',

    lookup_email_invites: 'SELECT uuid_from_bin(inviter_uuid_bin) AS inviter_uuid FROM invitation WHERE invitee_email = ?',
};


exports.DB = function() {
    var self = this;
    
    self.state_transition = function(new_state) {
	if ( new_state === State.CONNECTED || 
	     new_state === State.DISCONNECTED ||
	     new_state === State.CONNECTING || 
	     new_state === State.DISCONNECTING ) {
	    if ( self.state === new_state ) {
		D.log('BUG: Redundant state transition: ' + new_state);
	    }
	    else {
		D.log('Switching to state: ' + new_state);
		self.state = new_state;
	    }
	}
	else {
	    D.log('BUG: Invalid state: ' + new_state);
	}
    };


    self.connection_check = function(out_stream) {
	if ( self.state === State.CONNECTED ) {
	    if ( self.connection ) {
		return;
	    }
	    else {
		throw { rs: out_stream, message: 'Server failure: Bug: No database connection present' };
	    }
	}
	else {
	    throw { rs: out_stream, message: 'Server failure: Database is not connected, in state: ' + self.state };
	}
    };

    
    self.do_cmd = function(cmd, sql_params, out_stream, on_success, extract_from_mysql) {
	var sql  =  SQL[cmd];
	var query = mysql.format(sql, sql_params);
	D.log("\ncmd: " + cmd + ' params: ' + D.dump(sql_params) );
	self.connection.query(query, function(err, result) {
	    if ( err ) {
		D.log("Error: " + D.dump(err));
		// TODO: HTTP_UNAVAILABLE is often inaccurate. Unique key violations can easily happen as I/O
		// bound tasks take turns. For example two identical account requests may arrive and both pass
		// the initial unique email check, but only one can succeed.
		if ( err.code === 'ER_DUP_ENTRY' ) {
		    const sql_messy_uuid = err.toString().replace(/^.*Duplicate entry '([^']+)'.*$/, "$1");
		    const clean_uuid = sql_messy_uuid.escapedSQLValToUUID();
		    throw { rs: out_stream, message: 'The UUID ' + clean_uuid + ' already exists!' };
		}
		throw { rs: out_stream, message: 'Database reports: ' + err, http_code: C.HTTP_UNAVAILABLE };
	    }
	    var json_from_mysql = extract_from_mysql(result);
	    if ( json_from_mysql.err ) {
		throw { rs: out_stream, message: 'Application error: ' + json_from_mysql.err };
	    }
	    if ( typeof on_success === 'function' ) {
		on_success(json_from_mysql.result);
	    }
	});
    };
    

    self.mutate_onerow = function(cmd, sql_params, out_stream, on_success, is_delete, noop_ok) {
	self.do_cmd(cmd, sql_params, out_stream, on_success, function(result) {
	    if ( (noop_ok && result.affectedRows == 0) || result.affectedRows == 1 || is_delete ) {
		return { result: true };
	    }
	    return { err: 'Database error: ' + cmd + ' affected ' + result.affectedRows + ' rows' };
	});
    };


    self.make_uuid = function(out_stream, on_success) {
	self.do_cmd('make_uuid', [], out_stream, on_success, function(result) {
	    if ( result.length !== 1 || typeof result[0].uuid !== 'string' ) {
		return { err: 'Database error: UUID returned ' + D.dump(result) };
	    }
	    return { result: result[0].uuid };
	});
    };
    
    
    /* ACCOUNT operations */
    self.create_unvalidated_account = function(first_name, last_name, email, password_hash, validation_token,
					 out_stream, on_success) {
	self.make_uuid(out_stream, function(uuid) {
	    self.do_cmd('create_unvalidated_account',
			[ uuid, first_name, last_name, email, password_hash, validation_token ], 
			out_stream, on_success,
			function(result) { return { result: uuid }; });
	}); // make_uuid
    };


    self.lookup_unvalidated_account = function(email, token, out_stream, on_success) {
	self.do_cmd('lookup_unvalidated_account', [email, token], out_stream, on_success, function(result) {
	    if ( result.length > 1 ) {
		return { err: 'Database integrity error: multiple accounts with address "' + email + '"' };
	    }
	    if ( result.length == 0 ) {
		return { err: 'No account with address ' + email + ' and token ' + token };
	    }
	    if ( result[0].validated ) {
		return { err: 'Account already validated: ' + email };
	    }
	    return { result: result[0].uuid };
	});
    };

    
    self.validate_account = function(uuid, out_stream, on_success) {
	self.cached_lookup_account_by_uuid(uuid, out_stream, function(account) {
	    self.do_cmd('validate_account', [ uuid ], out_stream, on_success, function(result) {
		if ( result.affectedRows > 1 ) {
		    return { err: 'Database integrity error: multiple accounts with UUID "' + uuid + '"' };
		}
		if ( result.affectedRows == 0 ) {
		    return { err: 'Account ' + uuid + ' was already validated' };
		}
		account[AccountKeys.Validated] = 1;
		D.log('UUID ' + uuid + ' ' + account[AccountKeys.Email] + ' has been validated');
		return { result: account };
	    });
	});
    };


    self.set_validation_token = function(uuid, token, out_stream, on_success) {
	self.mutate_onerow('set_validation_token', [ token, uuid ], out_stream, on_success);
    };


    self.set_password_hash_and_reset_token = function(uuid, pw_hash, out_stream, on_success) {
	self.mutate_onerow('set_password_hash_and_reset_token', [ pw_hash, uuid ], out_stream, on_success);
    };


    self.lookup_account = function(uuid, out_stream, on_success) {
	self.do_cmd('lookup_account', [ uuid ], out_stream, on_success, function(result) {
	    if ( result.length > 1 ) {
		return { err: 'Database integrity error: multiple accounts with uuid "' + uuid + '"' };
	    }
	    return { result: result.length == 1 ? result[0] : null };
	});
    };


    self.lookup_account_by_email = function(email, out_stream, on_success) {
	self.do_cmd('lookup_account_by_email', [ email ], out_stream, on_success, function(result) {
	    if ( result.length > 1 ) {
		return { err: 'Database integrity error: multiple accounts with address "' + email + '"' };
	    }
	    return { result: result.length == 1 ? result[0] : null };
	});
    };


    self.search_accounts = function(match_string, out_stream, on_success) {
	var sqlpat = match_string.toLowerCase().trim() + '%';
	self.do_cmd('search_accounts', [ sqlpat, sqlpat, sqlpat ], out_stream, on_success, function(db_accounts) {
	    var matching_accounts = [];
	    for ( i = 0; i < db_accounts.length; i++ ) {
		/* Short cut this, don't use Account objects or global cache; matching only needs public name info */
		var db_acct = db_accounts[i];
		var net_acct = {
		    [EntityKeys.UUID]:       db_acct.uuid,
		    [AccountKeys.Email]:     db_acct.email,
		    [AccountKeys.FirstName]: db_acct.first_name,
		    [AccountKeys.LastName]:  db_acct.last_name,
		};
		matching_accounts.push(net_acct);
	    }
	    return { result: matching_accounts };
	});
    };


    self.set_notification_flags = function(uuid, new_notification_flags, out_stream, on_success) {
	self.mutate_onerow('set_notification_flags', [ new_notification_flags, uuid ], out_stream, function() {
	    global.Account[uuid][AccountKeys.NotificationFlags] = new_notification_flags;
	    on_success();
	});
    };


    self.change_password = function(uuid, new_password, out_stream, on_success) {
	self.mutate_onerow('change_password', [ new_password, uuid ], out_stream, function() {
	    global.Account[uuid][AccountKeys.Password] = new_password;
	    on_success();
	});
    };

    
    self.remove_account = function(uuid, out_stream, on_success) {
	self.mutate_onerow('remove_account', [ uuid ], out_stream, on_success);
    };


    self.invite_by_email = function(inviter_uuid, invitee_email, out_stream, on_success) {
	self.mutate_onerow('invite_by_email', [ inviter_uuid, invitee_email ], out_stream, on_success);
    };

    
    self.lookup_inviters = function(invitee_email, out_stream, on_success) {
	self.do_cmd('lookup_email_invites', [ invitee_email ], out_stream, on_success, function(db_inviters) {
	    var inviter_uuids = [];
	    for ( var i = 0; i < db_inviters.length; i++ ) {
		inviter_uuids.push(db_inviters[i].inviter_uuid);
	    }
	    D.log(invitee_email + ' invited by ' + D.dump(inviter_uuids));
	    return { result: inviter_uuids };
	});
    };
    

    self.request_connect = function(on_connect) {
	D.log('Enter');
	if ( self.state === State.DISCONNECTED ) {
	    var params = cfg.MYSQL_LIVE_PARAMS;
	    params.connectTimeout = cfg.DB.TIMEOUT_SEC * C.SEC_TO_MSEC;
	    params.ssl.ca = fs.readFileSync(params.ssl.ca_SOURCE);
	    params.ssl.cert = fs.readFileSync(params.ssl.cert_SOURCE);
	    params.ssl.key = fs.readFileSync(params.ssl.key_SOURCE);
	    self.connection = mysql.createConnection(params);
	    if ( !self.connection ) {
		D.log('BUG: self.connection was NULL even after createConnection');
		return;
	    }
	    self.state_transition(State.CONNECTING);
	    self.connection.connect(function(err) {
		if ( err ) {
		    self.state_transition(State.DISCONNECTED);
		    D.log('Database connection failed! ' + err);
		    D.log('Re-trying in ' + cfg.DB.TIMEOUT_SEC + ' sec');
		    setTimeout(function() {
			self.request_connect(on_connect);
		    }, cfg.DB.TIMEOUT_SEC * C.SEC_TO_MSEC);
		}
		else {
		    self.state_transition(State.CONNECTED);
		    D.log('Database connection succeeded: ' + D.sdump(self.connection));
		    if ( typeof on_connect === 'function' ) {
			on_connect();
		    }
		}
	    });
	}
	else if ( self.state === State.CONNECTED ) {
	    D.log('WARNING: Already connected, discarding request');
	}
	else if ( self.state === State.CONNECTING ) {
	    D.log('WARNING: Already trying to connect, discarding request');
	}
	else if ( self.state === State.DISCONNECTING ) {
	    D.log('Currently disconnecting, will retry in ' + cfg.DB.TIMEOUT_SEC + ' sec');
	    setTimeout(function() {
		self.request_connect(on_connect);
	    }, cfg.DB.TIMEOUT_SEC * C.SEC_TO_MSEC);
	}
	else {
	    D.log('BUG: Invalid state: ' + self.state);
	}
    };


    self.request_reset = function() {
	D.log('Enter');
	if ( self.state === State.CONNECTED ) {
	    if ( self.connection ) {
		D.log('Destroying exiting connection');
		self.connection.destroy();
		self.state_transition(State.DISCONNECTED);
		self.request_connect();
	    }
	    else {
		D.log('BUG: No connection to reset while in connected state, starting connection anyway');
		self.state_transition(State.DISCONNECTED);
		self.request_connect();
	    }
	}
	else if ( self.state === State.DISCONNECTED ) {
	    D.log('WARNING: Not connected when asked to reset');
	    self.request_connect();
	}
	else if ( self.state === State.CONNECTING || self.state === State.DISCONNECTING ) {
	    D.log('WARNING: Delaying reset while connection in transition: ' + self.state);
	    setTimeout(function() {
		self.request_connect();
	    }, cfg.DB.TIMEOUT_SEC * C.SEC_TO_MSEC);
	}
	else {
	    D.log('BUG: Invalid state: ' + self.state);
	}
    };


    self.request_shutdown = function() {
	D.log('Enter');
	if ( self.state === State.CONNECTED ) {
	    if ( self.connection ) {
		self.state_transition(State.DISCONNECTING);
		self.connection.end(function(err) {
		    self.state_transition(State.DISCONNECTED);
		    if ( err ) {
			D.log('MySQL close error: ' + err);
		    }
		});
	    }
	    else {
		D.log('BUG: No connection to shut down while state was connected');
		self.state_transition(State.DISCONNECTED);
		return;
	    }
	}
	else if ( self.state === State.DISCONNECTED ) {
	    D.log('WARNING: Asked to disconnect while already disconnected, discarding');
	}
	else if ( self.state === State.CONNECTING || self.state === State.DISCONNECTING ) {
	    D.log('BUG: Was asked to shut down while in transition: ' + self.state);
	    return;
	}
	else {
	    D.log('BUG: Invalid state: ' + self.state);
	}
    };


    self.keepalive = function() {
	if ( self.state === State.CONNECTED ) {
	    if ( self.connection ) {
		self.connection.query({sql: 'select 1', 
				       timeout: cfg.DB.KEEPALIVE_TIMEOUT_SEC * C.SEC_TO_MSEC}, 
				      function(err, db_results) {
					  if ( err ) {
					      D.log('Database keepalive err: ' + err + ' requesting reset');
					      self.request_reset();
					  }
				      });
	    }
	    else {
		D.log('BUG: No connection while in connected state');
	    }
	}
	else if ( self.state === State.DISCONNECTED || self.state === State.CONNECTING || self.state === State.DISCONNECTING ) {
	    D.log('WARNING: Cannot keepalive while in state ' + self.state);
	}
	else {
	    D.log('BUG: Invalid state: ' + self.state);
	}
    };


    self.keepalive = function() {
	self.connection.query({sql: 'select 1', 
			       timeout: cfg.DB.KEEPALIVE_TIMEOUT_SEC * C.SEC_TO_MSEC}, 
			      function(err, db_results) {
				  if ( err ) {
				      D.log('Database keepalive err: ' + err + ' resetting');
				      self.reset();
				  }
			      });
    };


    self.cached_lookup_account_by_uuid = function(uuid, out_stream, on_success) {
	if ( global.Account[uuid] ) {
	    D.log('Cache hit on account ' + uuid + ', returning immediately: ' + D.sdump(global.Account[uuid]));
	    on_success(global.Account[uuid]);
	    return;
	}
	D.log('Cache miss on account ' + uuid + ', looking up');
	self.lookup_account(uuid, out_stream, function(db_account) {
	    if ( !db_account ) {
		throw { rs: out_stream, message: 'No account with UUID ' + uuid };
	    }
	    // For dates, SQL can store zero as the timestamp but it will not be parseable as a date and hence will come back as a useless string
	    global.Account[uuid] = new Account({
		[EntityKeys.UUID]            : uuid,
		[EntityKeys.CreationDate]    : db_account.created instanceof Date ? db_account.created : new Date('2001'),
		[EntityKeys.ModificationDate]: db_account.modified instanceof Date ? db_account.modified : new Date('2001'),
		[AccountKeys.Validated]      : db_account.validated,
		[AccountKeys.NotificationFlags]:db_account.notification_flags,
		[AccountKeys.Password]       : db_account.password,
		[AccountKeys.Email]          : db_account.email,
		[AccountKeys.NotificationFlags]:db_account.notification_flags,
		[AccountKeys.FirstName]      : db_account.first_name,
		[AccountKeys.LastName]       : db_account.last_name}, out_stream);
	    global.Account[db_account.email] = global.Account[uuid]; // convenience: secondary key
	    D.log('global.Account[' + uuid + '] is set to ' + D.sdump(global.Account[uuid]));
	    D.log('global.Account[' + db_account.email + '] is set to ' + D.sdump(global.Account[db_account.email]));
	    on_success(global.Account[uuid]);
	});
    };


    self.cached_lookup_account_by_email = function(email, out_stream, on_success) {
	if ( global.Account[email] ) {
	    D.log('Cache hit on account ' + email + ', returning immediately: ' + D.sdump(global.Account[email]));
	    on_success(global.Account[email]);
	    return;
	}
	D.log('Cache miss on account ' + email + ', looking up');
	self.lookup_account_by_email(email, out_stream, function(db_account) {
	    if ( !db_account ) {
		on_success(null);
		return;
	    }
	    var uuid = db_account.uuid;
	    global.Account[uuid] = new Account({
		[EntityKeys.UUID]            : uuid,
		[EntityKeys.CreationDate]    : db_account.created,
		[AccountKeys.Validated]      : db_account.validated,
		[AccountKeys.ValidationToken]: db_account.validation_token,
		[AccountKeys.NotificationFlags]:db_account.notification_flags,
		[AccountKeys.Password]       : db_account.password,
		[AccountKeys.Email]          : email,
		[AccountKeys.FirstName]      : db_account.first_name,
		[AccountKeys.LastName]       : db_account.last_name}, out_stream);
	    global.Account[email] = global.Account[uuid];
	    on_success(global.Account[uuid]);
	});
    };

    self.state_transition(State.DISCONNECTED);
};

D.log('loaded ' + __filename);
