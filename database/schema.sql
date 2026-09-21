-- Library room reservation - schema
--
-- Creates an empty database with the four tables the application uses.
-- Run this first, then database/seed.sql for the demo rooms and time slots.
--
--   mysql -u root -p < database/schema.sql
--
-- Tested against MariaDB 10.4 (XAMPP) and MySQL 8.

CREATE DATABASE IF NOT EXISTS `library_room_reservation`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE `library_room_reservation`;

DROP TABLE IF EXISTS `booking`;
DROP TABLE IF EXISTS `room`;
DROP TABLE IF EXISTS `time_slot`;
DROP TABLE IF EXISTS `users`;

-- Students self-register. Lecturer and staff accounts are created by an
-- administrator; see the README for the promotion statement.
CREATE TABLE `users` (
  `user_id`      SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`        VARCHAR(100) NOT NULL,
  `password`     VARCHAR(255) NOT NULL COMMENT 'bcrypt hash',
  `first_name`   VARCHAR(50) NOT NULL,
  `last_name`    VARCHAR(50) DEFAULT NULL,
  `phone_number` VARCHAR(20) DEFAULT NULL,
  `role`         ENUM('student', 'staff', 'lecturer') NOT NULL DEFAULT 'student',
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE = InnoDB;

-- room_status: 1 = bookable, 0 = taken offline by staff.
CREATE TABLE `room` (
  `room_id`     SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_name`   VARCHAR(50) NOT NULL,
  `room_status` TINYINT(1) NOT NULL DEFAULT 1,
  `capacity`    INT UNSIGNED DEFAULT NULL,
  `location`    VARCHAR(100) NOT NULL,
  `description` VARCHAR(265) NOT NULL DEFAULT '',
  `image`       VARCHAR(100) NOT NULL DEFAULT '',
  PRIMARY KEY (`room_id`),
  UNIQUE KEY `uq_room_name` (`room_name`)
) ENGINE = InnoDB;

-- The fixed daily slots every room is bookable in.
CREATE TABLE `time_slot` (
  `slot_id`    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `start_time` TIME NOT NULL,
  `end_time`   TIME NOT NULL,
  PRIMARY KEY (`slot_id`),
  UNIQUE KEY `uq_time_slot` (`start_time`, `end_time`)
) ENGINE = InnoDB;

-- One row per booking request. A request starts as 'Waiting' and a lecturer
-- moves it to 'Approved' or 'Rejected', which also records the approver.
CREATE TABLE `booking` (
  `booking_id`     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        SMALLINT UNSIGNED NOT NULL,
  `room_id`        SMALLINT UNSIGNED NOT NULL,
  `slot_id`        SMALLINT UNSIGNED NOT NULL,
  `booking_date`   DATE NOT NULL,
  `objective`      VARCHAR(100) DEFAULT NULL,
  `booking_status` ENUM('Waiting', 'Approved', 'Rejected') NOT NULL DEFAULT 'Waiting',
  `approver_id`    SMALLINT UNSIGNED DEFAULT NULL,
  `created_time`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`booking_id`),
  KEY `idx_booking_user` (`user_id`),
  KEY `idx_booking_approver` (`approver_id`),
  KEY `idx_booking_slot` (`slot_id`),
  -- Availability is looked up by room, slot and date on nearly every page.
  KEY `idx_booking_room_slot_date` (`room_id`, `slot_id`, `booking_date`),
  CONSTRAINT `fk_booking_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_booking_approver` FOREIGN KEY (`approver_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_booking_slot` FOREIGN KEY (`slot_id`) REFERENCES `time_slot` (`slot_id`),
  CONSTRAINT `fk_booking_room` FOREIGN KEY (`room_id`) REFERENCES `room` (`room_id`)
) ENGINE = InnoDB;
