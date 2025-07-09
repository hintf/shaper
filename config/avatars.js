// Статичные аватары для персонажей
// Замените на ваши собственные URL изображений
const AVATAR_URLS = {
  1: 'https://cdn.yourdomain.com/apps/shapes-revolt/avatars/cat.jpg',
  2: 'https://cdn.yourdomain.com/apps/shapes-revolt/avatars/squirrel.jpg',
// etc
};

// Fallback аватары (если ваши изображения недоступны)
const FALLBACK_AVATARS = {
  1: 'https://api.dicebear.com/7.x/adventurer/svg?seed=cat&backgroundColor=FF6B6B',
  2: 'https://api.dicebear.com/7.x/adventurer/svg?seed=squirrel&backgroundColor=4ECDC4',
// etc
};

module.exports = {
  AVATAR_URLS,
  FALLBACK_AVATARS
};
