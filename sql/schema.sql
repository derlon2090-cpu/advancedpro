CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','admin') DEFAULT 'user',
  status ENUM('active','suspended') DEFAULT 'active',
  email_verified TINYINT(1) DEFAULT 0,
  last_login_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  plan_name VARCHAR(150) NOT NULL,
  image_quota INT DEFAULT 0,
  video_quota INT DEFAULT 0,
  video_max_duration_seconds INT DEFAULT 5,
  validity_days INT DEFAULT 30,
  renewal_enabled TINYINT(1) DEFAULT 0,
  renewal_every_days INT DEFAULT NULL,
  renewal_mode ENUM('topup','reset') DEFAULT 'topup',
  renewal_image_quota INT DEFAULT 0,
  renewal_video_quota INT DEFAULT 0,
  max_redemptions INT DEFAULT 1,
  redeemed_count INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  assigned_email VARCHAR(191) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE code_redemptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  code_id INT NOT NULL,
  redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (code_id) REFERENCES codes(id) ON DELETE CASCADE
);

CREATE TABLE user_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  code_id INT DEFAULT NULL,
  package_name VARCHAR(150) NOT NULL,
  image_balance INT DEFAULT 0,
  video_balance INT DEFAULT 0,
  video_max_duration_seconds INT DEFAULT 5,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  renewal_enabled TINYINT(1) DEFAULT 0,
  renewal_every_days INT DEFAULT NULL,
  renewal_mode ENUM('topup','reset') DEFAULT 'topup',
  renewal_image_quota INT DEFAULT 0,
  renewal_video_quota INT DEFAULT 0,
  next_renewal_at DATETIME DEFAULT NULL,
  status ENUM('active','expired','cancelled') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (code_id) REFERENCES codes(id) ON DELETE SET NULL
);

CREATE TABLE usage_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subscription_id INT NOT NULL,
  type ENUM('image','video') NOT NULL,
  amount_used INT DEFAULT 1,
  prompt_text TEXT,
  output_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id) ON DELETE CASCADE
);

CREATE TABLE site_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(150) NOT NULL UNIQUE,
  setting_value TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE login_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL,
  ip_address VARCHAR(64) DEFAULT '',
  failed_attempts INT DEFAULT 0,
  locked_until DATETIME DEFAULT NULL,
  last_attempt_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_login_attempt (email, ip_address)
);

INSERT INTO site_settings (setting_key, setting_value)
VALUES
  ('store_url', 'https://advproai.com'),
  ('support_whatsapp', '966556915980'),
  ('support_whatsapp_message', 'السلام عليكم أبغى الاشتراك في Advanced Pro')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
