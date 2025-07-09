const { AVATAR_URLS, FALLBACK_AVATARS } = require('../config/avatars');

class AvatarManager {
  constructor() {
    this.cache = new Map();
  }

  // Получение аватара для персонажа
  async getShapeAvatar(shapeId) {
    if (this.cache.has(shapeId)) {
      return this.cache.get(shapeId);
    }

    let avatarUrl = AVATAR_URLS[shapeId];
    
    // Проверяем доступность основного аватара
    if (avatarUrl) {
      const isAvailable = await this.checkUrlAvailability(avatarUrl);
      if (!isAvailable) {
        console.warn(`Primary avatar for shape ${shapeId} not available, using fallback`);
        avatarUrl = FALLBACK_AVATARS[shapeId];
      }
    } else {
      avatarUrl = FALLBACK_AVATARS[shapeId];
    }

    this.cache.set(shapeId, avatarUrl);
    return avatarUrl;
  }

  // Проверка доступности URL
  async checkUrlAvailability(url) {
    return new Promise((resolve) => {
      const https = require('https');
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'HEAD',
        timeout: 3000
      };

      const req = https.request(options, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => resolve(false));
      req.end();
    });
  }

  // Очистка кеша
  clearCache() {
    this.cache.clear();
  }
}

module.exports = AvatarManager;