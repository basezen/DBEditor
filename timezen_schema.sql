use timezen;

SET FOREIGN_KEY_CHECKS = 0;

DELIMITER |
CREATE FUNCTION id_to_text(b BINARY(16))
RETURNS CHAR(36) DETERMINISTIC
BEGIN
  DECLARE hex CHAR(32);
  SET hex = HEX(b);
  RETURN LOWER(CONCAT(LEFT(hex, 8), '-', MID(hex, 9,4), '-', MID(hex, 13,4), '-', MID(hex, 17,4), '-', RIGHT(hex, 12)));
END
|
CREATE FUNCTION text_to_id(s CHAR(36))
RETURNS BINARY(16) DETERMINISTIC
RETURN UNHEX(CONCAT(LEFT(s, 8), MID(s, 10, 4), MID(s, 15, 4), MID(s, 20, 4), RIGHT(s, 12)))
|
DELIMITER ;

CREATE TABLE `job` (
  `id`            BINARY(16)    NOT NULL,
  `created`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`       TIMESTAMP     NULL,
  `client_id`     BINARY(16)    NOT NULL,
  `consultant_id` BINARY(16)    NOT NULL,
  `start_time`    TIMESTAMP     NOT NULL,
  `end_time`      TIMESTAMP     NOT NULL,
  `location`      VARCHAR(63)   NOT NULL,
  `billing_notes` VARCHAR(1023) NOT NULL,  
  `private_notes` VARCHAR(511)  NOT NULL,
  `miles_driven`  INT           DEFAULT NULL,
  `transport_fee` INT           DEFAULT NULL,
  UNIQUE KEY (`id`),
  CONSTRAINT `constraint_client_id`
    FOREIGN KEY (`client_id`)
    REFERENCES `timezen`.`client` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
);


CREATE TABLE `consultant` (
  `id`            BINARY(16)    NOT NULL,
  `created`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`       TIMESTAMP     NULL,
  `payee_id`      BINARY(16)    NOT NULL,
  `rate_cents_us` INT,
  UNIQUE KEY (`id`),
  CONSTRAINT `constraint_payee_id`
    FOREIGN KEY (`payee_id`)
    REFERENCES `timezen`.`contact` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
);


CREATE TABLE `client` (
  `id`            BINARY(16)    NOT NULL,
  `created`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`       TIMESTAMP     NULL,
  `billing_id`    BINARY(16)    NOT NULL,
  UNIQUE KEY (`id`),
  CONSTRAINT `constraint_billing_id`
    FOREIGN KEY (`billing_id`)
    REFERENCES `timezen`.`contact` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
);


CREATE TABLE `contact` (
  `id`            BINARY(16)    NOT NULL,
  `category`      INT,
  `created`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`       TIMESTAMP     NULL,
  `first_name`    VARCHAR(32),
  `middle_name`   VARCHAR(32),
  `last_name`     VARCHAR(64),
  UNIQUE KEY (`id`)
);

SET FOREIGN_KEY_CHECKS = 1;

CREATE USER `timezen_app_server`@`localhost` identified by 't1m3z3nD3v';
GRANT EXECUTE,SELECT,INSERT,UPDATE,DELETE on timezen.* to `timezen_app_server`@`localhost`;
FLUSH PRVILEGES;
