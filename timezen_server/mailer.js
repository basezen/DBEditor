var cfg = require('./config.js');
var D = require(cfg.LIB + 'debugger.js').debugger;
D.log('loading ' + __filename);


var nodemailer     = require('nodemailer');
var smtpTransport  = require('nodemailer-smtp-transport');
var signer         = require('nodemailer-dkim').signer;
var identifiers    = require('./identifiers.js').identifiers;
var EmailSubject   = identifiers.EmailSubject;
var EmailBody      = identifiers.EmailBody;
var Entities       = identifiers.Entities;
var EntityKeys     = identifiers.EntityKeys;
var AccountKeys    = identifiers.AccountKeys;
var AccountActions = identifiers.AccountActions;
var StorageKeys    = identifiers.StorageKeys;
var StorageActions = identifiers.StorageActions;

var smtpMailer = null;
var Transporter = null;

exports.init = function(dkim_private_key) {
    smtpMailer = smtpTransport({
	host: 'TODO',
	port: 587,
	auth: {
            user: 'TODO',
            pass: 'TODO',
	},            
	secure: false, /* Negotiate TLS on STARTTLS, don't start off with SSL */
	tls: {
	    rejectUnauthorized: true, /* Verify certificate chain */
	},
	logger: true,
	debug: false,
    });
    Transporter = nodemailer.createTransport(smtpMailer);
    Transporter.use('stream', signer({ domainName: 'TODO', keySelector: 'TODO', privateKey: dkim_private_key }));
};


exports.send_account_validation = function(email, first_name, token) {
    var validation_link = global.Server_URL + Entities.Account + '/' + AccountActions.Validate
	+ '?' + AccountKeys.Email + '=' + encodeURIComponent(email)
	+ '&' + AccountKeys.ValidationToken + '=' + encodeURIComponent(token);
    
    var mail_parameters = {
	from: cfg.Email.ADMIN_SENDER,
	to: email,
	subject: EmailSubject.AccountValidation,
	html: global.Email[EmailBody.AccountValidation]
	    .replace(/<!-- MERGE OwnerFirstName -->/g, first_name)
	    .replace(/<!-- MERGE ValidationLink -->/g, validation_link),
    };
    D.log('Sending email to ' + email);
    Transporter.sendMail(mail_parameters, function(err, info) {
	if ( err ) {
	    D.log('ERROR: could not send account confirmation email to ' + email + ': ' + err);
	}
    });
};


exports.send_account_invitation = function(inviter, invitee_email) {
    var mail_parameters = {
	from: cfg.Email.ADMIN_SENDER,
	to: invitee_email,
	subject: EmailSubject.AccountInvitation
	    .replace(/<!-- MERGE InviterFullName -->/g, inviter.full_name()),
	html: global.Email[EmailBody.AddedAsFriendConfirmation]
	    .replace(/<!-- MERGE MemberFirstName -->/g, invitee_email)
	    .replace(/<!-- MERGE OwnerFullName -->/g, inviter.full_name())
	    .replace(/<!-- MERGE OwnerUUID -->/g, inviter[EntityKeys.UUID])
	    .replace(/<!-- MERGE ServerName -->/g, cfg.Server),
    };
    D.log('Inviting ' + invitee_email + ' from ' + inviter[AccountKeys.Email]);
    Transporter.sendMail(mail_parameters, function(err, info) {
	if ( err ) {
	    D.log('ERROR: could not send invitation email to ' + invitee_email + ': ' + err);
	}
    });
};

    
exports.send_member_add_confirmations = function(owner, member) {
    var member_mail_parameters = {
	from: cfg.Email.ADMIN_SENDER,
	to: member[AccountKeys.Email],
	subject: EmailSubject.AddedAsFriendConfirmation
	    .replace(/<!-- MERGE OwnerFullName -->/g, owner.full_name()),
	html: global.Email[EmailBody.AddedAsFriendConfirmation]
	    .replace(/<!-- MERGE MemberFirstName -->/g, member[AccountKeys.FirstName])
	    .replace(/<!-- MERGE OwnerFullName -->/g, owner.full_name())
	    .replace(/<!-- MERGE OwnerUUID -->/g, owner[EntityKeys.UUID])
	    .replace(/<!-- MERGE ServerName -->/g, cfg.Server),
    };

    // TODO: Do we still want this going out?
    var owner_mail_parameters = {
	from: cfg.Email.ADMIN_SENDER,
	to: owner[AccountKeys.Email],
	subject: EmailSubject.FriendAddedConfirmation
	    .replace(/<!-- MERGE MemberFullName -->/g, member.full_name()),
	html: global.Email[EmailBody.FriendAddedConfirmation]
	    .replace(/<!-- MERGE OwnerFirstName -->/g, owner[AccountKeys.FirstName])
	    .replace(/<!-- MERGE MemberFullName -->/g, member.full_name())
	    .replace(/<!-- MERGE ServerName -->/g, cfg.Server),
    };

    Transporter.sendMail(owner_mail_parameters, function(err, info) {
	if ( err ) {
	    D.log('ERROR: could not membership confirmation email to ' + owner[AccountKeys.Email] + ': ' + err);
	}
    });

    Transporter.sendMail(member_mail_parameters, function(err, info) {
	if ( err ) {
	    D.log('ERROR: could not membership confirmation email to ' + member[AccountKeys.Email] + ': ' + err);
	}
    });
};

    
exports.send_password_reset_validation = function(account, token) {
    var recipient = account[AccountKeys.Email];
    var password_reset_link = global.Server_URL + Entities.Storage + '/' + StorageActions.Retrieve
	+ '?' + StorageKeys.FileName + '=' + 'resources/password_reset.html'
	+ '&' + AccountKeys.Email + '=' + encodeURIComponent(recipient)
	+ '&' + AccountKeys.ValidationToken + '=' + encodeURIComponent(token);

    D.log('EmailBody.PasswordResetValidation: ' + EmailBody.PasswordResetValidation);
    D.log('global.Email[EmailBody.PasswordResetValidation]: ' + (typeof global.Email[EmailBody.PasswordResetValidation]));
    var mail_parameters = {
	from: cfg.Email.ADMIN_SENDER,
	to: recipient,
	subject: EmailSubject.PasswordResetValidation,
	html: global.Email[EmailBody.PasswordResetValidation]
	    .replace(/<!-- MERGE OwnerFirstName -->/, account[AccountKeys.FirstName])
	    .replace(/<!-- MERGE PasswordResetLink -->/, password_reset_link),
    };
    Transporter.sendMail(mail_parameters, function(err, info) {
	if ( err ) {
	    D.log('ERROR: could not send password reset validation to ' + recipient + ': ' + err);
	}
    });
};


exports.send_password_change_confirmation = function(account) {
    var recipient = account[AccountKeys.Email]; 
    var mail_parameters = {
	from: cfg.Email.ADMIN_SENDER,
	to: recipient,
	subject: EmailSubject.PasswordChangeConfirmation,
	html: global.Email[EmailBody.PasswordChangeConfirmation]
	    .replace(/<!-- MERGE OwnerFirstName -->/, account[AccountKeys.FirstName])
	    .replace(/<!-- MERGE TransactionTime -->/, Date()),
    };
    Transporter.sendMail(mail_parameters, function(err, info) {
	if ( err ) {
	    D.log('ERROR: could not send password change notification to ' + recipient + ': ' + err);
	}
    });
};


exports.send_new_bulletin_notification = function(poster, recipient_email, board_name, recipient_firstname) { 
    var mail_parameters = {
	from: cfg.Email.ADMIN_SENDER,
	to: recipient_email,
	subject: EmailSubject.NewBulletinPublished
	    .replace(/<!-- MERGE OwnerFullName -->/g, poster.full_name())
	    .replace(/<!-- MERGE BoardName -->/g, board_name),
	html: global.Email[EmailBody.NewBulletinPublished]
	    .replace(/<!-- MERGE MemberFirstName -->/g, recipient_firstname)
	    .replace(/<!-- MERGE OwnerFullName -->/g, poster.full_name())
	    .replace(/<!-- MERGE OwnerUUID -->/g, poster[EntityKeys.UUID])
	    .replace(/<!-- MERGE BoardName -->/g, board_name),
    };
    D.log('Notifying ' + recipient_email + ' from ' + poster[AccountKeys.Email]);
    Transporter.sendMail(mail_parameters, function(err, info) {
	if ( err ) {
	    D.log('ERROR: could not send invitation email to ' + recipient_email + ': ' + err);
	}
    });
};


D.log('loaded ' + __filename);
