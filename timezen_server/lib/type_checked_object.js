/*
  type_check.js
  Copyright General Enchantment LLC / BaseZen Consulting Inc. All Rights Reserved.
  Author: Daniel Bromberg, BaseZen Consulting Inc.
*/

var D = require('./debugger.js').debugger;
D.log('loading ' + __filename);

var ETbl = {
    UNKNOWN_EXCEPTION: { code: 0, message: "Unknown or incorrectly specified exception" },
    MISSING_FUNCTION_PARAMETER: { code: 1, message: "Missing function parameter" },
    BAD_TYPE_FUNCTION_PARAMETER: { code: 2, message: "Function parameter has wrong type" },
    BAD_PROPERTY_FUNCTION_PARAMETER: { code: 3, message: "Function parameter has missing or bad property" },
    MISSING_PROPERTY_INITIALIZER: { code: 4, message: "Missing required property" },
    BAD_PROPERTY_INITIALIZER: { code: 5, message: "Property has invalid type or instance" },
};


var Exception = function(exception_info, obj, specifics, response_stream) {
    var self = this;
    if ( response_stream ) {
	self.rs = response_stream;
    }
    self.message = "Exception #" + exception_info.code + ' (' + exception_info.message + ')';
    self.code = exception_info.code;
    if ( specifics ) {
	self.message += ' ' + specifics;
    }
    if ( obj && obj.name ) {
	self.message += ' in class ' + obj.name;
    }
};


Exception.prototype = {
    toString: function() {
	var self = this;
	return self.message;
    }
};


Type_Checked_Object = function(name, descriptors, response_stream) {
    var self = this;
    
    if ( typeof name !== 'string' && name !== '' ) {
	throw new Exception(ETbl.MISSING_FUNCTION_PARAMETER, self, 'Class name', response_stream);
    }
    self.name = name;

    if ( !(descriptors instanceof Array) ) {
	throw new Exception(ETbl.MISSING_FUNCTION_PARAMETER, self, 'Descriptors', response_stream);
    }
    var names = {};
    var valid_types = { 'object': true, 'string': true, 'number': true };
    for ( var i = 0; i < descriptors.length; i++ ) {
	var descriptor = descriptors[i];
	// D.log('validating descriptor #' + i + ': ' + descriptor.name);
	if ( typeof descriptor.name !== 'string' || descriptor.name === '' ) {
	    throw new Exception(ETbl.BAD_PROPERTY_FUNCTION_PARAMETER, self, 'Descriptor #' + i + ' has no name', response_stream);
	}
	if ( names[descriptor.name] ) {
	    throw new Exception(ETbl.BAD_PROPERTY_FUNCTION_PARAMETER, self, 'Descriptor ' + descriptor.name + ' has duplicate name', response_stream);
	}
	names[descriptor.name] = true;
	if ( typeof descriptor.type !== 'string' || !valid_types[descriptor.type] ) {
	    throw new Exception(ETbl.BAD_PROPERTY_FUNCTION_PARAMETER, self,
				'Descriptor ' + descriptor.name + ' has invalid type: ' + descriptor.type, response_stream);
	}
	if ( typeof descriptor.required !== 'boolean' && typeof descriptor.required !== 'undefined' ) {
	    throw new Exception(ETbl.BAD_PROPERTY_FUNCTION_PARAMETER, self,
				'Descriptor ' + descriptor.name + ' has invalid "required" value: ' + descriptor.required, response_stream);
	}
	if ( descriptor.type !== 'object' && descriptor.instance ) {
	    throw new Exception(ETbl.BAD_PROPERTY_FUNCTION_PARAMETER, self,
				'Descriptor ' + descriptor.name + ' wants instance ' + descriptor.instance + ' but is not object', response_stream);
	}
	if ( typeof descriptor.instance !== 'function' && typeof descriptor.instance !== 'undefined' ) {
	    throw new Exception(ETbl.BAD_PROPERTY_FUNCTION_PARAMETER, self,
				'Descriptor ' + descriptor.name + ' has invalid instance', response_stream);
	}
    }
    self.descriptors = descriptors;
    self.descriptors.push({
	name:     'UUID', // TODO this is techncially a backward dependency on identifiers.js
	type:     'string',
	required: true,
    });
    self.descriptors.push({
	name:     'CreationDate',
	type:     'object',
	instance: Date,
	required: true,
    });
    self.descriptors.push({
	name:     'ModificationDate',
	type:     'string',
	type:     'object',
	instance: Date,
	required: false,
    });

    // D.log('Object ' + name + ' has ' + descriptors.length + ' descriptors');
}


Type_Checked_Object.prototype = {
    initialize_properties: function(settings, response_stream) {
	var self = this;
	if ( typeof settings !== 'object' ) {
	    throw new Exception(ETbl.MISSING_FUNCTION_PARAMETER, "settings", null, response_stream);
	}
	for ( var i = 0; i < self.descriptors.length; i++ ) {
	    var descriptor = self.descriptors[i];
	    var stype = typeof settings[descriptor.name];
	    if ( descriptor.required && (stype === 'undefined' || settings[descriptor.name] === null) ) {
		throw new Exception(ETbl.MISSING_PROPERTY_INITIALIZER, self, descriptor.name, response_stream);
	    }
	    // If it's not required, null is always OK
	    if ( !descriptor.required && settings[descriptor.name] === null ) { // this is how empty values come back from DB
		continue;
	    }
	    if ( stype !== 'undefined' && stype !== descriptor.type ) {
		throw new Exception(ETbl.BAD_PROPERTY_INITIALIZER, self, descriptor.name + ' has wrong type ' + stype, response_stream);
	    }
	    if ( stype === 'object' && !(settings[descriptor.name] instanceof descriptor.instance) ) {
		throw new Exception(ETbl.BAD_PROPERTY_INITIALIZER, self,
				    'Parameter ' + descriptor.name + ' not an instance of ' + descriptor.instance, response_stream);
	    }
	    self[descriptor.name] = settings[descriptor.name];
	}
    },

    
    update_from: function(changed) {
	var self = this;
	if ( changed.name !== self.name ) {
	    throw 'Mismatched object update between ' + changed.name + ' and a ' + self.name;
	}
	if ( changed.UUID !== self.UUID ) {
	    throw 'Conflicting UUIDs for ' + self.UUID + ' vs ' + changed.UUID;
	}
	for ( var i = 0; i < self.descriptors.length; i++ ) {
	    var desc_name = self.descriptors[i].name;
	    if ( self[desc_name] !== changed[desc_name]
		 && !(self.descriptors[i].type === 'number'
		      && isNaN(self[desc_name]) && isNaN(changed[desc_name])) ) {
		D.log('Updating changed property ' + desc_name
		      + ' from ' + self[desc_name] + ' to ' + changed[desc_name]);
		self[desc_name] = changed[desc_name];
	    }
	}
    },


    // Only the pre-defined properties, not the methods or anything added after
    network_instance: function() {
	var self = this;
	var ni = {};
	for ( var i = 0; i < self.descriptors.length; i++ ) {
	    var descriptor = self.descriptors[i];
	    if ( !descriptor.server_only ) {
		ni[descriptor.name] = self[descriptor.name];
	    }
	}
	return ni;
    },


    toString: function() {
	var self = this;
	
	var output = '';
	for ( var i = 0; i < self.descriptors.length; i++ ) {
	    var descriptor = self.descriptors[i];
	    output += '[' + descriptor.name + ']: ' + self[descriptor.name] + (output !== '' ? ' ' : '');
	}
	return output;
    }
}


exports.network_collection = function(collection) {
    var nc = {};
    for ( var key in collection ) {
	nc[key] = collection[key].network_instance();
    }
    return nc;
}


exports.Type_Checked_Object = Type_Checked_Object;
exports.Exception_Table = ETbl;
exports.Exception = Exception;

D.log('loaded ' + __filename);
