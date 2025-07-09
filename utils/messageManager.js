class MessageManager {
  constructor(revoltAPI) {
    this.api = revoltAPI;
    this.recentBotMessages = new Set();
    this.recentUserMessages = new Map(); // Для хранения последних сообщений пользователя
    this.recentBotResponses = new Map(); // Для связывания ответов бота с исходными сообщениями пользователя
    this.askAnotherShapeCooldown = new Map(); // Для отслеживания кулдауна по каналам
    this.pendingDeletions = new Map(); // Для отложенного удаления
  }

  // Отправка сообщения с автоматическим сохранением ID
  async sendMessage(channelId, content, masquerade = null, originalUserMessageId = null) {
    try {
      const MAX_LENGTH = 1000;
      
      const messageBody = { content };
      if (masquerade) {
        messageBody.masquerade = masquerade;
      }
      
      if (content.length <= MAX_LENGTH) {
        const response = await this.api.post(`/channels/${channelId}/messages`, messageBody);
        
        if (response.data && response.data._id) {
          this.addBotMessage(response.data._id);
          
          // Связываем ответ бота с исходным сообщением пользователя
          if (originalUserMessageId) {
            this.recentBotResponses.set(response.data._id, originalUserMessageId);
          }
          
          // Добавляем реакцию "🔄" если это не служебное сообщение
          if (!content.includes('**Выберите персонажа:**') && 
              !content.includes('**Выберите другого персонажа для ответа на ваш вопрос:**') &&
              !content.includes('⏰ Подождите') &&
              !content.includes('отвечает на ваш вопрос')) {
            try {
              await this.addReactionToMessage(channelId, response.data._id, '🔄');
            } catch (error) {
              console.error('Error adding 🔄 reaction:', error.message);
            }
          }
        }
        return response.data;
      } else {
        // Разбиваем длинные сообщения на части
        const chunks = this.splitMessage(content, MAX_LENGTH);
        
        for (const chunk of chunks) {
          const chunkBody = { content: chunk };
          if (masquerade) {
            chunkBody.masquerade = masquerade;
          }
          
          const response = await this.api.post(`/channels/${channelId}/messages`, chunkBody);
          if (response.data && response.data._id) {
            this.addBotMessage(response.data._id);
            if (originalUserMessageId) {
              this.recentBotResponses.set(response.data._id, originalUserMessageId);
            }
          }
        }
        return { message: 'All chunks sent' };
      }
    } catch (error) {
      console.error('Error sending message:', error.message);
      throw error;
    }
  }

  // Добавление реакции к сообщению
  async addReactionToMessage(channelId, messageId, emoji) {
    const encodedEmoji = encodeURIComponent(emoji);
    const endpoint = `/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}`;
    await this.api.put(endpoint);
  }

  // Разбиение сообщения на части
  splitMessage(content, maxLength) {
    const chunks = [];
    let currentChunk = '';
    const paragraphs = content.split('\n\n');

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length + 2 <= maxLength) {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = paragraph;
        
        while (currentChunk.length > maxLength) {
          let splitPoint = currentChunk.lastIndexOf(' ', maxLength);
          if (splitPoint === -1) splitPoint = maxLength;
          chunks.push(currentChunk.slice(0, splitPoint));
          currentChunk = currentChunk.slice(splitPoint).trim();
        }
      }
    }
    
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }

  // Добавление ID сообщения бота в кеш
  addBotMessage(messageId) {
    this.recentBotMessages.add(messageId);
    if (this.recentBotMessages.size > 100) {
      const firstMessage = [...this.recentBotMessages][0];
      this.recentBotMessages.delete(firstMessage);
    }
  }

  // Добавление сообщения пользователя в кеш
  addRecentUserMessage(messageId, messageData) {
    this.recentUserMessages.set(messageId, messageData);
    // Ограничиваем размер кеша
    if (this.recentUserMessages.size > 50) {
      const firstMessage = [...this.recentUserMessages.keys()][0];
      this.recentUserMessages.delete(firstMessage);
    }
  }

  // Получение сообщения пользователя из кеша
  getRecentUserMessage(messageId) {
    return this.recentUserMessages.get(messageId);
  }

  // Проверка, является ли сообщение ответом на бота
  isReplyToBot(replies) {
    if (!replies || replies.length === 0) return false;
    return replies.some(id => this.recentBotMessages.has(id));
  }

  // Проверка и установка кулдауна
  checkAndSetCooldown(channelId, cooldownMs) {
    const now = Date.now();
    const lastUsed = this.askAnotherShapeCooldown.get(channelId) || 0;
    
    if (now - lastUsed < cooldownMs) {
      return false;
    }
    
    this.askAnotherShapeCooldown.set(channelId, now);
    return true;
  }

  // Планирование удаления сообщений через определенное время
  scheduleMessageDeletion(channelId, messageIds, delayMs = 60000) {
    const timeoutId = setTimeout(async () => {
      for (const messageId of messageIds) {
        await this.api.deleteMessage(channelId, messageId);
      }
      this.pendingDeletions.delete(channelId);
    }, delayMs);

    // Отменяем предыдущее удаление если есть
    if (this.pendingDeletions.has(channelId)) {
      clearTimeout(this.pendingDeletions.get(channelId));
    }
    
    this.pendingDeletions.set(channelId, timeoutId);
  }

  // Отмена запланированного удаления
  cancelScheduledDeletion(channelId) {
    if (this.pendingDeletions.has(channelId)) {
      clearTimeout(this.pendingDeletions.get(channelId));
      this.pendingDeletions.delete(channelId);
    }
  }
}

module.exports = MessageManager;