// Статичные аватары для персонажей
// Замените на ваши собственные URL изображений
const AVATAR_URLS = {
  1: 'https://cdn.tenewera.ru/apps/shapes-revolt/avatars/cat-narrator.jpg',      // Кот-Сказитель
  2: 'https://cdn.tenewera.ru/apps/shapes-revolt/avatars/squirry.jpg',          // Белочка
  3: 'https://cdn.tenewera.ru/apps/shapes-revolt/avatars/thedoge.jpg',               // Пёсель
  4: 'https://cdn.tenewera.ru/apps/shapes-revolt/avatars/shadyraccoon.jpg',           // Енот
  5: 'https://cdn.tenewera.ru/apps/shapes-revolt/avatars/thegrandsire.jpg',           // Старик
  6: 'https://cdn.tenewera.ru/apps/shapes-revolt/avatars/day.jpg'                // Дей
};

// Fallback аватары (если ваши изображения недоступны)
const FALLBACK_AVATARS = {
  1: 'https://api.dicebear.com/7.x/adventurer/svg?seed=cat&backgroundColor=FF6B6B',
  2: 'https://api.dicebear.com/7.x/adventurer/svg?seed=squirrel&backgroundColor=4ECDC4',
  3: 'https://api.dicebear.com/7.x/adventurer/svg?seed=dog&backgroundColor=45B7D1',
  4: 'https://api.dicebear.com/7.x/adventurer/svg?seed=raccoon&backgroundColor=96CEB4',
  5: 'https://api.dicebear.com/7.x/adventurer/svg?seed=oldman&backgroundColor=FFEAA7',
  6: 'https://api.dicebear.com/7.x/adventurer/svg?seed=day&backgroundColor=DDA0DD'
};

module.exports = {
  AVATAR_URLS,
  FALLBACK_AVATARS
};