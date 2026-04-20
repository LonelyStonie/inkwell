-- =====================================================
-- INKWELL v2 - Story Platform with Authentication
-- =====================================================
-- QUAN TRỌNG: Script này sẽ XÓA TOÀN BỘ DỮ LIỆU CŨ
-- và tạo lại schema với bảng users + phân quyền

CREATE DATABASE IF NOT EXISTS inkwell
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE inkwell;

-- Xóa bảng cũ theo đúng thứ tự (do FK)
DROP TABLE IF EXISTS chapters;
DROP TABLE IF EXISTS stories;
DROP TABLE IF EXISTS users;

-- -----------------------------------------------------
-- Bảng: users
-- Lưu tài khoản người dùng và vai trò
-- -----------------------------------------------------
CREATE TABLE users (
  id            VARCHAR(50)   NOT NULL,
  username      VARCHAR(50)   NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_username (username),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Bảng: stories
-- Chỉ admin mới có thể tạo. user_id liên kết đến admin đã đăng
-- -----------------------------------------------------
CREATE TABLE stories (
  id              VARCHAR(50)   NOT NULL,
  user_id         VARCHAR(50)   NOT NULL,
  title           VARCHAR(255)  NOT NULL,
  author          VARCHAR(100)  NOT NULL,
  genre           VARCHAR(50)   NOT NULL,
  description     TEXT,
  cover_color     VARCHAR(100)  DEFAULT 'from-amber-700 to-orange-900',
  banner_filename VARCHAR(255)  DEFAULT NULL,
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_story_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  INDEX idx_genre (genre),
  INDEX idx_user (user_id),
  INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Bảng: chapters
-- -----------------------------------------------------
CREATE TABLE chapters (
  id            VARCHAR(50)   NOT NULL,
  story_id      VARCHAR(50)   NOT NULL,
  title         VARCHAR(255)  NOT NULL,
  content       LONGTEXT      NOT NULL,
  chapter_order INT           NOT NULL DEFAULT 0,
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_chapter_story
    FOREIGN KEY (story_id) REFERENCES stories(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  INDEX idx_story_order (story_id, chapter_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- KIỂM TRA
-- =====================================================
SELECT 'Database v2 created successfully!' AS status;
SELECT 'Cách dùng: user ĐẦU TIÊN đăng ký sẽ tự động là admin' AS note;
SELECT 'Sau đó admin có thể phân quyền cho user khác trong Admin Dashboard' AS note2;
