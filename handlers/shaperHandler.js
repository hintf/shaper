const { shapeConfig } = require('../config/shapes');
const AvatarManager = require('../utils/avatarManager');

class ShaperHandler {
  constructor(revoltAPI, messageManager, availableShapes) {
    this.api = revoltAPI;
    this.messageManager = messageManager;
    this.availableShapes = availableShapes;
    this.activeShapes = new Map();
    this.avatarManager = new AvatarManager();
    this.shaperMessages = new Map(); // Для отслеживания сообщений выбора персонажа
    this.askAnotherShapeMessages = new Map(); // Для отслеживания сообщений "Спросить другого персонажа"
    this.lastBotProfileUpdate = 0; // Для ограничения частоты обновления профиля бота
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
      // Устанавливаем активный Shape для канала
      this.activeShapes.set(channelId, selectedShapeId);
      
      // Отправляем подтверждение
      const config = shapeConfig[selectedShapeId];
      const masquerade = await this.createMasquerade(selectedShapeId);
      
      await this.messageManager.sendMessage(
        channelId, 
        `🎭 Персонаж изменён на **${config.name}** ${config.emoji}`,
        masquerade
      );

      // Смена никнейма и аватара основного бота:
      await this.updateBotProfile(selectedShapeId);

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

  // Получение активного персонажа для канала
  getActiveShape(channelId) {
    return this.activeShapes.get(channelId);
  }

  // Получение маскарада для активного персонажа
  async getActiveMasquerade(channelId) {
    const activeShapeId = this.activeShapes.get(channelId);
    if (!activeShapeId) return null;
    
    return await this.createMasquerade(activeShapeId);
  }

  // Обработка команды "Спросить другого персонажа"
  async handleAskAnotherShapeCommand(channelId, originalUserMessageId) {
    try {
      // Проверяем кулдаун
      if (!this.messageManager.checkAndSetCooldown(channelId, 30000)) {
        const cooldownMessage = await this.messageManager.sendMessage(
          channelId, 
          "⏰ Подождите 30 секунд перед повторным использованием этой функции."
        );
        
        // Удаляем сообщение о кулдауне через 5 секунд
        if (cooldownMessage && cooldownMessage._id) {
          this.messageManager.scheduleMessageDeletion(channelId, [cooldownMessage._id], 5000);
        }
        return;
      }

      const currentShapeId = this.activeShapes.get(channelId);
      const availableShapeIds = Object.keys(this.availableShapes).filter(id => id !== currentShapeId);
      
      if (availableShapeIds.length === 0) {
        await this.messageManager.sendMessage(
          channelId, 
          "❌ Нет других доступных персонажей для выбора."
        );
        return;
      }

      let message = "🔄 **Выберите другого персонажа для ответа на ваш вопрос:**\n\n";
      
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
        this.askAnotherShapeMessages.set(sentMessage._id, {
          channelId: channelId,
          originalUserMessageId: originalUserMessageId
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
      console.error('Error handling ask another shape command:', error.message);
      await this.messageManager.sendMessage(channelId, "❌ Ошибка при обработке команды выбора персонажа.");
    }
  }

  // Обработка реакции на сообщение "Спросить другого персонажа"
  async handleAskAnotherShapeSelection(messageId, emoji, userId, botId) {
    if (userId === botId) return false;

    const messageInfo = this.askAnotherShapeMessages.get(messageId);
    if (!messageInfo) return false;

    // Ищем соответствующий Shape по эмодзи
    let selectedShapeId = null;
    for (const [shapeId, config] of Object.entries(shapeConfig)) {
      if (config.emoji === emoji) {
        selectedShapeId = shapeId;
        break;
      }
    }

    if (selectedShapeId && this.availableShapes[selectedShapeId]) {
      const { channelId, originalUserMessageId } = messageInfo;
      
      // Устанавливаем выбранный Shape как активный
      const previousShapeId = this.activeShapes.get(channelId);
      this.activeShapes.set(channelId, selectedShapeId);
      
      // Получаем исходное сообщение пользователя
      const originalUserMessage = this.messageManager.getRecentUserMessage(originalUserMessageId);
      if (originalUserMessage) {
        // Отправляем подтверждение смены персонажа
        const config = shapeConfig[selectedShapeId];
        const masquerade = await this.createMasquerade(selectedShapeId);
        
        await this.messageManager.sendMessage(
          channelId, 
          `🔄 ${config.name} отвечает на ваш вопрос...`,
          masquerade
        );

        // Возвращаем информацию для повторной обработки сообщения
        const result = {
          shouldReprocess: true,
          originalMessage: originalUserMessage,
          channelId: channelId,
          selectedShapeId: selectedShapeId,
          previousShapeId: previousShapeId
        };

        // Планируем удаление сообщения выбора через минуту
        this.messageManager.scheduleMessageDeletion(channelId, [messageId], 60000);
        this.askAnotherShapeMessages.delete(messageId);

        return result;
      }
    }

    return false;
  }

  // Обновление профиля основного бота в зависимости от персонажа
  async updateBotProfile(shapeId) {
    try {
      // Проверяем ограничение частоты (не чаще раза в 10 секунд)
      const now = Date.now();
      if (now - this.lastBotProfileUpdate < 10000) {
        console.log('Bot profile update skipped due to rate limit');
        return false;
      }

      const config = shapeConfig[shapeId];
      if (!config) return false;

      const avatar = await this.avatarManager.getShapeAvatar(shapeId);
      const username = config.name;

      const result = await this.api.updateBotProfile(username, avatar);
      
      if (result) {
        this.lastBotProfileUpdate = now;
        console.log(`Bot profile updated to ${username}`);
      }
      
      return result;
    } catch (error) {
      console.error('Error updating bot profile:', error.message);
      return false;
    }
  }
}

module.exports = ShaperHandler;