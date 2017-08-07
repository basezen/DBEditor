/*
  storage.js

  File-system operations

  Copyright General Enchantment LLC / BaseZen Consulting Inc. All Rights Reserved.
  Author: Daniel Bromberg, BaseZen Consulting Inc.
*/

var cfg = require('./config.js');
var D = require(cfg.LIB + 'debugger.js').debugger;
D.log('loading ' + __filename);
var util = require(cfg.LIB + 'utilities.js').utilities;

var fs   = require('fs');
var path = require('path');
var jimp = require('jimp');
var make_uuid   = require('node-uuid').v1;

var identifiers = require('./identifiers.js').identifiers;

var httpio      = require('./httpio.js');
var medianode_ops = require('./medianode_ops.js');

var MediaNodeActions  = identifiers.MediaNodeActions;
var MediaNodeEntitiesEnum = identifiers.MediaNodeEntitiesEnum;
var MediaAllowedTypes = identifiers.MediaAllowedTypes;
var MediaNodeKeys     = identifiers.MediaNodeKeys;
var AccountKeys       = identifiers.AccountKeys;
var EntityKeys        = identifiers.EntityKeys;
var StorageKeys       = identifiers.StorageKeys;
var ResponseKeys      = identifiers.ResponseKeys;
var Entities          = identifiers.Entities;
var Actions           = identifiers.StorageActions;


function enforce_range(number, name, min, max, response_stream) {
    if ( !isNaN(number) && (number < min || number > max) ) {
	throw { rs: response_stream, message: 'Out of range ' + name + ': ' + number };
    }
}

function parse_image_request(request_params, mime_type, response_stream) {
    var width  = Number(request_params[StorageKeys.MaxWidth]); // OK if undefined, will parse to NaN
    var height = Number(request_params[StorageKeys.MaxHeight]);
    enforce_range(width,  'maximum width',  20, 2000, response_stream);
    enforce_range(height, 'maximum height', 20, 2000, response_stream);
    if ( isNaN(width) && isNaN(height) ) {
	throw { rs: response_stream, message: 'Must define maximum height or maximum width for image resize' };
    }
    if ( !mime_type.jimp_type ) {
	throw { rs: response_stream, 
		message: 'Unable to resize non-image type: ' + mime_type.encoding };
    }

    var resource_path;
    var resource_base = path.basename(request_params[StorageKeys.FileName]);
    var resource_dir  = path.dirname(request_params[StorageKeys.FileName]);

    D.log('base: ' + resource_base + ' dir: ' + resource_dir + ' width: ' + width + ' height: ' + height);
    if ( !isNaN(width) ) {
	resource_path = resource_dir + '/width_' + width + '_' + resource_base;
    }
    else {
	resource_path = resource_dir + '/height_' + height + '_' + resource_base;
    }

    D.log('Calculated result path: ' + resource_path);
    return { in_path: request_params[StorageKeys.FileName], out_path: resource_path, width: width, height: height };
}


function read_image_file(image_info, mime_type, response_stream, session, recursed) {
    // Optimistically check for cached result
    fs.stat(image_info.out_path, function(stats_err, stats) {
	if ( !stats_err ) {
	    if ( !recursed ) {
		D.log('Found cached ' + image_info.out_path + ' on first try');
	    }
	    send_file(image_info.out_path, mime_type, stats, response_stream, session);
	    return;
	}
	if ( recursed ) {
	    throw { rs: response_stream, message: 'Unable to read back scaled image: ' + image_info.out_path };
	}
	D.log('need to scale resource path: ' + image_info.in_path);
	jimp.read(image_info.in_path, function(read_err, image) {
	    if ( read_err ) {
		throw { rs: response_stream, message: read_err };
	    }
	    var aspect_ratio = image.bitmap.width / image.bitmap.height;
	    var scaled_y = !isNaN(image_info.height) ? image_info.height : image_info.width / aspect_ratio;
	    var scaled_x = !isNaN(image_info.width) ? image_info.width : image_info.height * aspect_ratio;
	    
	    D.log('Aspect ratio: ' + aspect_ratio + ' Scaled width: ' + scaled_x + ' scaled height: ' + scaled_y);
	    image.resize(scaled_x, scaled_y).write(image_info.out_path, function(write_err) {
		if ( write_err ) {
		    throw { rs: response_stream, message: write_err };
		}
		D.log('wrote out scaled path: ' + image_info.out_path + ', recursing on request');
		read_image_file(image_info, mime_type, response_stream, session, true);
	    });
	});
    });
}


function read_regular_file(request_params, mime_type, response_stream, session) {
    var resource_path = './' + request_params[StorageKeys.FileName];
    fs.stat(resource_path, function(stats_err, stats) {
	if ( stats_err ) {
	    throw { rs: response_stream,
		    message: 'Could not locate requested resource. Details: ' +  stats_err };
	}
	send_file(resource_path, mime_type, stats, response_stream, session);
    });
}


function send_file(resource_path, mime_info, stats, response_stream, session) {
    D.log('Enter, type: ' + mime_info + ' path: ' + resource_path);
    if ( !stats.isFile() ) {
	throw { rs: response_stream,
		message: 'Object exists but is not a file: ' + resource_path };
    }
    
    fs.readFile(resource_path, mime_info.encoding, function(read_err, file_buf) {
	if ( read_err ) {
	    throw { rs: response_stream, message: read_err };
	}
	var base = path.basename(resource_path);
	var responder = httpio.make_responder(mime_info, response_stream);
	var now = new Date();
	var headers = {
	    'Content-Disposition': 'inline; filename="' + base + '"', 
	    'Date': util.HTTPHeaderUTC(now),
	};
	var expiration = 0;
	// Randomize expiration to avoid thundering herd of expired data refreshes
	if ( mime_info.mime.match(/^image\/jpe?g/) || mime_info.mime.match(/^image\/png/) ) {
	    expiration = 86400 + Math.round(Math.random() * 14400);
	}
	else if ( mime_info.mime.match(/^text\/css/) || mime_info.mime.match(/^application\/javascript/) ) {
	    expiration = 7200 + Math.round(Math.random() * 1200);
	}
	// Currently, an client offline client won't know its web cache has become
	// invalid, so we'll keep the HTML interval low -- it will always get back up to date in a few minutes.

	// The current sync protocol is not strong enough to do surgically precise
	// invalidation of WKWebCache data, but we don't want to just throw it all away
	// when a client comes online either.
	else {
	    D.log('setting cookie for ' + mime_info.mime + '/' + base + ': ' + session.saved_cookie);
	    headers['Set-Cookie'] = session.saved_cookie;
	    expiration = 300 + Math.round(Math.random() * 60);
	}
	D.log('Cache control is ' + expiration + ' for ' + mime_info.mime + ' path ' + resource_path);
	headers['Cache-Control'] = 'max-age=' + expiration;
	now.setSeconds(now.getSeconds() + expiration);
	headers['Expires'] = util.HTTPHeaderUTC(now);
	responder(file_buf, headers, 200);
    });
}


function store(object_uuid, account, content_type, quality, input_stream, output_stream, success_callback) {
    var dir_name;
    var extension;

    D.log('Enter, object_uuid: ' + object_uuid);

    switch ( content_type ) {
    case 'image/jpeg': 
    case 'image/jpg': 
	if ( typeof quality !== 'number' ) {
	    D.log('Warning: quality not set with image, reverting to lowest');
	    quality = 1;
	}
	dir_name = 'image';    extension = '_' + quality + '.jpg';  break;

    case 'image/x-png':  
    case 'image/png':
	dir_name = 'image';    extension = '.png';  break;

    case 'text/html':
	dir_name = 'bulletin'; extension = '.html'; break;

    default:
	D.log('WARNING: Unknown MIME type: ' + content_type);
	dir_name = 'unknown';  extension = content_type.replace(/^.*\//, '');
    }
    
    var path = ('accounts/' + account[AccountKeys.Email] + '/' + dir_name + '/' + object_uuid + extension).toLowerCase();
    var local_name = process.cwd() + '/' + path;
    // DO NOT pre-pend a slash; the client side handles that
    var remote_name = Entities.Storage + '/' + Actions.Retrieve + '?' + StorageKeys.FileName + '=' + path;
    var options = { flags: 'w', defaultEncoding: 'binary', mode: 0o666 };
    var file = fs.createWriteStream(local_name, options);

    D.log('created ' + path + ' waiting for data');
    input_stream.on('data', function(chunk) {
	D.log('got some data');
	file.write(chunk);
    }).on('end', function() {
	D.log('got end of file');
	file.end();
	if ( typeof success_callback === 'function' ) {
	    success_callback(remote_name);
	}
    }).on('error', function(err) {
	D.log('error ' + err);
	throw { rs: output_stream, message: err };
    }).on('aborted', function(err) {
	D.log('aborted ' + err);
	throw { rs: output_stream, message: err };
    });
    D.log('set up stream');
};

exports.append_string_to_file = function(object, local_path) {
    var file = fs.createWriteStream(local_path, { flags: 'a' });
    file.write(object + "\n");
    file.end();
}

exports.read_regular_file = read_regular_file; // Internal use

exports[Actions.Retrieve] = function(session, request_headers, request_params, response_stream) {
    D.log('Enter');
    util.check_params([StorageKeys.FileName], request_params, response_stream);
    var mime_type = util.to_mime(path.extname(request_params[StorageKeys.FileName]).toLowerCase());
    if ( !mime_type ) {
	throw { rs: response_stream, 
		message: 'Unknown mime type: ' + path.extname(request_params[StorageKeys.FileName]).toLowerCase() };
    }
    if ( request_params[StorageKeys.MaxHeight] || request_params[StorageKeys.MaxWidth] ) {
	read_image_file(parse_image_request(request_params, mime_type, response_stream),
			mime_type, response_stream, session, false);
    }
    else {
	read_regular_file(request_params, mime_type, response_stream, session);
    }
};


exports[Actions.CreateUserRepo] = function(_, _, request_params, response_stream, on_success) {
    D.log('Enter');
    util.check_params([AccountKeys.Email], request_params, response_stream);
    var email = request_params[AccountKeys.Email];
    var base_path = (process.cwd() + '/accounts/' + email).toLowerCase();
    fs.mkdir(base_path, 0o750, function(acct_create_err) {
	fs.mkdir(base_path + '/image', 0o750, function(image_create_err) {
	    fs.mkdir(base_path + '/bulletin', 0o750, function(bulletin_create_err) {
		if ( image_create_err || bulletin_create_err ) {
		    throw { rs: response_stream, message: "Couldn't create image repository on server. Technical details:"
			    + (acct_create_err ? " " + image_create_err : "")
			    + (image_create_err ? " " + image_create_err : "")
			    + (bulletin_create_err ? " " + bulletin_create_err : "") };
		}
		if ( typeof on_success === 'function' ) {
		    on_success();
		}
	    });
	});
    });
};

exports[Actions.Upload] = function(session, request, request_params, responder) {
    D.log('enter');
    var quality = Number(request_params[StorageKeys.ImageQuality]);
    var existing_uuid = request_params[EntityKeys.UUID];

    var content_type;
    if ( request.headers['Content-Type'] ) {
	content_type = request.headers['Content-Type'];
    }
    else if ( !content_type ) { // iOS sends lower case?!
	content_type = request.headers['content-type'];
    }
    else {
	throw { rs: responder.rs, message: 'Content-Type header missing' };
    }
    content_type = content_type.replace(/;.*$/, '');
    if ( !MediaAllowedTypes[content_type] ) {
	throw { rs: responder.rs, message: 'Cannot handle content type: ' + content_type };
    }	    

    if ( existing_uuid ) {
	// Now that we are social, modifying an existing bulletin may actually be somebody else's.
	existing_uuid = existing_uuid.toLowerCase();
	D.log('Update, type: ' + content_type + ' uuid: ' + existing_uuid);
	global.DB.lookup_media_node(existing_uuid, responder.rs, function(node) {
	    if ( !node ) {
		throw { rs: responder.rs, message: 'Cannot update unknown node: ' + existing_uuid };
	    }
	    D.log('Owner UUID: ' + node[EntityKeys.OwnerUUID]);
	    global.DB.cached_lookup_account_by_uuid(node[EntityKeys.OwnerUUID], responder.rs, function(owner_account) {
		if ( !owner_account ) {
		    throw { rs: responder.rs, message: 'Cannot update node of unknown owner: ' + node[EntityKeys.OwnerUUID] };
		}
		D.log('Found owner of' + node[EntityKeys.OwnerUUID] + ': ' + D.sdump(owner_account));
		store(existing_uuid, owner_account, content_type, quality, request, responder.rs, function(remote_url) {
		    responder({ [ResponseKeys.Success]: true,
				[ResponseKeys.Info]:    'Updated storage ' + existing_uuid,
				[ResponseKeys.Result]:  {
				    [EntityKeys.UUID]  : existing_uuid,
				    [MediaNodeKeys.URL]: remote_url,
				},
		      }); // responder
		}); // store file
	    }); // lookup_account
	}); // lookup_media_node
    } // if existing
    else {
	D.log('New upload, type: ' + content_type);
	var media_uuid = make_uuid();
	var owner_uuid = session.account[EntityKeys.UUID];
	
  	store(media_uuid, session.account, content_type, quality, request, responder.rs, function(remote_url) {
	    if ( content_type === 'text/html') {
		// No need to store this content in an "HTML" library; URL used immediately as bulletin property
		responder({ [ResponseKeys.Success]: true,
			    [ResponseKeys.Info]:    'Uploaded HTML document at ' + remote_url,
			    [ResponseKeys.Result]:  {
				[EntityKeys.UUID]:   media_uuid,  // Slightly redundant but why force client to parse out the UUID
				[MediaNodeKeys.URL]: remote_url,
			    },
			  });
	    }
	    else {
		// On the other hand an Image is a pseudo-bulletin to be shown under a 'photos' channel
		const publish_params = { 
		    [MediaNodeKeys.ParentUUID]: session.account.all_photos[EntityKeys.UUID], 
		    [MediaNodeKeys.NodeType]  : MediaNodeEntitiesEnum.Bulletin,
		    [MediaNodeKeys.URL]       : remote_url,
		};
		// Override medianode_ops:PublishNew responder with our own: this wasn't a client request
		const override_responder = function(result) {
		    const child_uuid = result[ResponseKeys.Result][EntityKeys.UUID];
		    responder({
			[ResponseKeys.Success]: true,
			[ResponseKeys.Result]: global.Media_Node[child_uuid].network_instance(),
		    });
		};
		override_responder.rs = responder.rs;
		medianode_ops[MediaNodeActions.PublishNew](session, request.headers, publish_params, override_responder);
	    }
	});
    }  // new upload else branch
}; // upload function

D.log('loaded ' + __filename);
