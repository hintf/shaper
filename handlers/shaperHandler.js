const { shapeConfig } = require('../config/shapes');
const AvatarManager = require('../utils/avatarManager');

class ShaperHandler {
  constructor(revoltAPI, messageManager, availableShapes) {
    this.api = revoltAPI;
    this.messageManager = messageManager;
    this.availableShapes = availableShapes;
    // Изменяем структуру хранения: теперь ключ - это "channelId:userId"
    this.activeShapes = new Map();
    this.avatarManager = new AvatarManager();
    this.shaperMessages = new Map(); // Для отслеживания сообщений выбора персонажа
  }

  // Создание составного ключа для хранения активного персонажа
  createUserShapeKey(channelId, userId) {
    return `${channelId}:${userId}`;
  }

  // Обработка команды !shaper
  async handleShaperCommand(channelId, originalMessageId) {
    try {
      let message = "🎭 **Выберите персонажа:**\n\n";
      
      const availableShapeIds = Object.keys(this.availableShapes);
      for (const shapeId of availableShapeIds) {
        const config = shapeConfig[shapeId];
        if (config) {
          message += `${config.emoji} - ${config.name}\n`;
        }
      }
      
      message += "\n*Нажмите на реакцию, чтобы выбрать персонажа*";
      
      const sentMessage = await this.messageManager.sendMessage(channelId, message);
      
      if (sentMessage && sentMessage._id) {
        // Сохраняем информацию о сообщении выбора
        this.shaperMessages.set(channelId, {
          selectionMessageId: sentMessage._id,
          originalMessageId: originalMessageId
        });

        // Добавляем реакции
        for (const shapeId of availableShapeIds) {
          const config = shapeConfig[shapeId];
          if (config && config.emoji) {
            await this.addReaction(channelId, sentMessage._id, config.emoji);
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
      
      return sentMessage;
    } catch (error) {
      console.error('Error handling shaper command:', error.message);
      await this.messageManager.sendMessage(channelId, "❌ Ошибка при обработке команды выбора персонажа.");
    }
  }

  // Добавление реакции к сообщению
  async addReaction(channelId, messageId, emoji) {
    try {
      const encodedEmoji = encodeURIComponent(emoji);
      const endpoint = `/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}`;
      await this.api.put(endpoint);
    } catch (error) {
      console.error(`Error adding reaction ${emoji}:`, error.message);
    }
  }

  // Обработка реакции на выбор персонажа
  async handleShapeSelection(channelId, emoji, userId, botId) {
    if (userId === botId) return;

    // Ищем соответствующий Shape по эмодзи
    let selectedShapeId = null;
    for (const [shapeId, config] of Object.entries(shapeConfig)) {
      if (config.emoji === emoji) {
        selectedShapeId = shapeId;
        break;
      }
    }

    if (selectedShapeId && this.availableShapes[selectedShapeId]) {
      // Устанавливаем активный Shape для пользователя в данном канале
      const userShapeKey = this.createUserShapeKey(channelId, userId);
      this.activeShapes.set(userShapeKey, selectedShapeId);
      
      // Отправляем подтверждение
      const config = shapeConfig[selectedShapeId];
      const masquerade = await this.createMasquerade(selectedShapeId);
      
      await this.messageManager.sendMessage(
        channelId, 
        `🎭 Ваш персонаж изменён на **${config.name}** ${config.emoji}`,
        masquerade
      );

      // Планируем удаление сообщений через минуту
      if (this.shaperMessages.has(channelId)) {
        const { selectionMessageId, originalMessageId } = this.shaperMessages.get(channelId);
        const messagesToDelete = [selectionMessageId];
        if (originalMessageId) messagesToDelete.push(originalMessageId);
        
        this.messageManager.scheduleMessageDeletion(channelId, messagesToDelete, 60000);
        this.shaperMessages.delete(channelId);
      }

      return true;
    }

    return false;
  }

  // Создание маскарада для персонажа
  async createMasquerade(shapeId) {
    try {
      const config = shapeConfig[shapeId];
      if (!config) return null;

      const avatar = await this.avatarManager.getShapeAvatar(shapeId);
      
      return {
        name: config.name,
        avatar: avatar,
        colour: config.colour
      };
    } catch (error) {
      console.error('Error creating masquerade:', error.message);
      return null;
    }
  }

  // Получение активного персонажа для пользователя в канале
  getActiveShape(channelId, userId) {
    const userShapeKey = this.createUserShapeKey(channelId, userId);
    return this.activeShapes.get(userShapeKey);
  }

  // Получение маскарада для активного персонажа пользователя
  async getActiveMasquerade(channelId, userId) {
    const activeShapeId = this.getActiveShape(channelId, userId);
    if (!activeShapeId) return null;
    
    return await this.createMasquerade(activeShapeId);
  }
}

module.exports = ShaperHandler;
