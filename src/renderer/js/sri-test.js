/**
 * SRI性压抑指数测试
 * Sexual Repression Index Test
 */

class SRITest {
  constructor() {
    this.currentQuestionIndex = 0;
    this.answers = [];
    this.categories = {
      emotional: [], // 情感压抑
      physical: [],  // 身体压抑
      social: []     // 社会压抑
    };
    
    // 题库 - 30道题，每个维度10道
    this.questions = [
      // 情感压抑维度 (1-10)
      {
        id: 1,
        category: 'emotional',
        text: '当你对某人产生好感或性吸引时，你会：',
        options: [
          { text: '毫不犹豫地表达出来', score: 0 },
          { text: '会表达，但比较含蓄', score: 3 },
          { text: '内心挣扎，不确定是否应该表达', score: 7 },
          { text: '压抑这种感觉，不让任何人知道', score: 10 }
        ]
      },
      {
        id: 2,
        category: 'emotional',
        text: '你如何看待自己的性幻想？',
        options: [
          { text: '认为这是自然和健康的', score: 0 },
          { text: '偶尔会有，但不太在意', score: 3 },
          { text: '觉得有些不好意思', score: 7 },
          { text: '感到羞耻或内疚', score: 10 }
        ]
      },
      {
        id: 3,
        category: 'emotional',
        text: '当朋友谈论性相关话题时，你的反应是：',
        options: [
          { text: '自然参与讨论', score: 0 },
          { text: '会听但较少发表意见', score: 3 },
          { text: '感到不自在，尽量避开话题', score: 7 },
          { text: '非常尴尬，想要离开', score: 10 }
        ]
      },
      {
        id: 4,
        category: 'emotional',
        text: '你认为表达性需求是：',
        options: [
          { text: '正常且应该被尊重的', score: 0 },
          { text: '可以接受但要看情况', score: 3 },
          { text: '不太合适，应该含蓄', score: 7 },
          { text: '令人羞耻的', score: 10 }
        ]
      },
      {
        id: 5,
        category: 'emotional',
        text: '看到性感的画面或内容时，你会：',
        options: [
          { text: '自然地欣赏', score: 0 },
          { text: '会看但不会表现出来', score: 3 },
          { text: '快速避开视线', score: 7 },
          { text: '感到强烈的不适', score: 10 }
        ]
      },
      {
        id: 6,
        category: 'emotional',
        text: '对于亲密关系中的身体接触，你：',
        options: [
          { text: '享受并主动寻求', score: 0 },
          { text: '喜欢但不会主动', score: 3 },
          { text: '需要时间才能适应', score: 7 },
          { text: '感到紧张和抗拒', score: 10 }
        ]
      },
      {
        id: 7,
        category: 'emotional',
        text: '你觉得性是：',
        options: [
          { text: '生活中美好的一部分', score: 0 },
          { text: '重要但不是最重要的', score: 3 },
          { text: '必要但不太舒服的事', score: 7 },
          { text: '应该避免或最小化的', score: 10 }
        ]
      },
      {
        id: 8,
        category: 'emotional',
        text: '当感受到性冲动时，你会：',
        options: [
          { text: '接纳这种感觉', score: 0 },
          { text: '感觉正常但不会特别关注', score: 3 },
          { text: '试图分散注意力', score: 7 },
          { text: '强烈地压制这种感觉', score: 10 }
        ]
      },
      {
        id: 9,
        category: 'emotional',
        text: '你如何评价自己对性的态度？',
        options: [
          { text: '开放且健康', score: 0 },
          { text: '比较正常', score: 3 },
          { text: '偏保守', score: 7 },
          { text: '非常保守或压抑', score: 10 }
        ]
      },
      {
        id: 10,
        category: 'emotional',
        text: '谈论自己的性经历或想法时，你：',
        options: [
          { text: '可以坦然分享', score: 0 },
          { text: '和亲密的人可以谈', score: 3 },
          { text: '很少谈论', score: 7 },
          { text: '绝对不会谈论', score: 10 }
        ]
      },

      // 身体压抑维度 (11-20)
      {
        id: 11,
        category: 'physical',
        text: '你对自己身体的性感部位的态度是：',
        options: [
          { text: '欣赏和接纳', score: 0 },
          { text: '基本接受', score: 3 },
          { text: '有些不自在', score: 7 },
          { text: '感到羞耻或想要遮掩', score: 10 }
        ]
      },
      {
        id: 12,
        category: 'physical',
        text: '在私密环境中，你对裸露的态度：',
        options: [
          { text: '非常自在', score: 0 },
          { text: '能够接受', score: 3 },
          { text: '需要适应', score: 7 },
          { text: '极度不适', score: 10 }
        ]
      },
      {
        id: 13,
        category: 'physical',
        text: '你会主动探索自己的身体吗？',
        options: [
          { text: '会，这很自然', score: 0 },
          { text: '偶尔会', score: 3 },
          { text: '很少这样做', score: 7 },
          { text: '从不，感觉不对', score: 10 }
        ]
      },
      {
        id: 14,
        category: 'physical',
        text: '对于身体的性反应（如兴奋），你：',
        options: [
          { text: '理解并接受', score: 0 },
          { text: '知道这正常', score: 3 },
          { text: '有时感到困扰', score: 7 },
          { text: '感到羞耻或想要抑制', score: 10 }
        ]
      },
      {
        id: 15,
        category: 'physical',
        text: '你如何看待自慰？',
        options: [
          { text: '正常且健康的自我探索', score: 0 },
          { text: '可以接受但不常谈论', score: 3 },
          { text: '有些不好意思', score: 7 },
          { text: '认为这是错误或羞耻的', score: 10 }
        ]
      },
      {
        id: 16,
        category: 'physical',
        text: '在亲密时刻，你对触摸的反应：',
        options: [
          { text: '身体自然放松和回应', score: 0 },
          { text: '大多时候能放松', score: 3 },
          { text: '需要时间才能放松', score: 7 },
          { text: '身体紧绷，难以放松', score: 10 }
        ]
      },
      {
        id: 17,
        category: 'physical',
        text: '你会照镜子观察自己的身体吗？',
        options: [
          { text: '会，并欣赏自己', score: 0 },
          { text: '偶尔会看', score: 3 },
          { text: '很少仔细看', score: 7 },
          { text: '尽量避免', score: 10 }
        ]
      },
      {
        id: 18,
        category: 'physical',
        text: '对于性相关的身体感觉，你：',
        options: [
          { text: '充分享受', score: 0 },
          { text: '能够感受', score: 3 },
          { text: '感觉迟钝', score: 7 },
          { text: '几乎没有感觉或刻意麻木', score: 10 }
        ]
      },
      {
        id: 19,
        category: 'physical',
        text: '你认为身体的性唤起是：',
        options: [
          { text: '自然的生理反应', score: 0 },
          { text: '正常但不太关注', score: 3 },
          { text: '有时让人困扰', score: 7 },
          { text: '需要控制或压制的', score: 10 }
        ]
      },
      {
        id: 20,
        category: 'physical',
        text: '洗澡时触碰身体的敏感部位，你：',
        options: [
          { text: '自然且不会多想', score: 0 },
          { text: '正常清洁', score: 3 },
          { text: '会快速略过', score: 7 },
          { text: '感到不适或羞耻', score: 10 }
        ]
      },

      // 社会压抑维度 (21-30)
      {
        id: 21,
        category: 'social',
        text: '你认为社会对性的看法影响了你吗？',
        options: [
          { text: '没有，我有自己的观点', score: 0 },
          { text: '有一些影响但不大', score: 3 },
          { text: '影响较大', score: 7 },
          { text: '深受影响，很难摆脱', score: 10 }
        ]
      },
      {
        id: 22,
        category: 'social',
        text: '你会因为社会眼光而隐藏自己的性取向或偏好吗？',
        options: [
          { text: '不会，做真实的自己', score: 0 },
          { text: '偶尔会考虑', score: 3 },
          { text: '经常会隐藏', score: 7 },
          { text: '完全隐藏，不敢表露', score: 10 }
        ]
      },
      {
        id: 23,
        category: 'social',
        text: '如果周围人谈论开放的性观念，你会：',
        options: [
          { text: '支持并参与讨论', score: 0 },
          { text: '中立态度', score: 3 },
          { text: '内心不认同但不说', score: 7 },
          { text: '强烈反对', score: 10 }
        ]
      },
      {
        id: 24,
        category: 'social',
        text: '你认为"好女孩/好男孩"应该对性：',
        options: [
          { text: '没有固定标准，尊重个人选择', score: 0 },
          { text: '适度开放即可', score: 3 },
          { text: '应该保守谨慎', score: 7 },
          { text: '必须压抑和避免', score: 10 }
        ]
      },
      {
        id: 25,
        category: 'social',
        text: '你担心他人对你性生活的评价吗？',
        options: [
          { text: '不担心，这是我的私事', score: 0 },
          { text: '偶尔会想', score: 3 },
          { text: '比较在意', score: 7 },
          { text: '非常担心和在意', score: 10 }
        ]
      },
      {
        id: 26,
        category: 'social',
        text: '传统道德观念对你的性观念影响：',
        options: [
          { text: '基本没影响', score: 0 },
          { text: '有一些但不强', score: 3 },
          { text: '影响较大', score: 7 },
          { text: '完全受其束缚', score: 10 }
        ]
      },
      {
        id: 27,
        category: 'social',
        text: '你会因为别人的看法而改变自己的性行为吗？',
        options: [
          { text: '不会', score: 0 },
          { text: '偶尔会考虑', score: 3 },
          { text: '经常会', score: 7 },
          { text: '总是这样', score: 10 }
        ]
      },
      {
        id: 28,
        category: 'social',
        text: '你认为公开讨论性是：',
        options: [
          { text: '正常且必要的', score: 0 },
          { text: '某些场合可以', score: 3 },
          { text: '不太合适', score: 7 },
          { text: '绝对不应该', score: 10 }
        ]
      },
      {
        id: 29,
        category: 'social',
        text: '家庭对性的态度影响了你的性观念吗？',
        options: [
          { text: '没有，我已经形成独立观点', score: 0 },
          { text: '有一些影响', score: 3 },
          { text: '影响很大', score: 7 },
          { text: '完全继承了家庭观念', score: 10 }
        ]
      },
      {
        id: 30,
        category: 'social',
        text: '你认为表达性欲望会被社会贴上不好的标签吗？',
        options: [
          { text: '不会，这很正常', score: 0 },
          { text: '可能会但我不在意', score: 3 },
          { text: '会，所以要小心', score: 7 },
          { text: '一定会，必须避免', score: 10 }
        ]
      }
    ];

    this.init();
  }

  init() {
    this.renderQuestion();
    this.updateProgress();
  }

  renderQuestion() {
    const question = this.questions[this.currentQuestionIndex];
    const container = document.getElementById('testContent');

    container.innerHTML = `
      <div class="question-card fade-in">
        <div class="question-number">问题 ${question.id}</div>
        <h2 class="question-text">${question.text}</h2>
        <div class="options-container">
          ${question.options.map((option, index) => `
            <div class="option-item" onclick="sriTest.selectOption(${index})">
              <div class="option-radio">
                <div class="radio-inner"></div>
              </div>
              <div class="option-text">${option.text}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  selectOption(optionIndex) {
    const question = this.questions[this.currentQuestionIndex];
    const selectedScore = question.options[optionIndex].score;

    // 记录答案
    this.answers[this.currentQuestionIndex] = selectedScore;
    this.categories[question.category].push(selectedScore);

    // 视觉反馈
    const options = document.querySelectorAll('.option-item');
    options.forEach((opt, idx) => {
      if (idx === optionIndex) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }
    });

    // 延迟后进入下一题
    setTimeout(() => {
      this.nextQuestion();
    }, 500);
  }

  nextQuestion() {
    this.currentQuestionIndex++;

    if (this.currentQuestionIndex >= this.questions.length) {
      this.showResults();
    } else {
      this.renderQuestion();
      this.updateProgress();
    }
  }

  updateProgress() {
    const progress = ((this.currentQuestionIndex + 1) / this.questions.length) * 100;
    document.getElementById('progressFill').style.width = progress + '%';
    document.getElementById('currentQuestion').textContent = this.currentQuestionIndex + 1;
    document.getElementById('totalQuestions').textContent = this.questions.length;
  }

  calculateScores() {
    // 计算各维度分数
    const emotionalScore = this.calculateCategoryScore('emotional');
    const physicalScore = this.calculateCategoryScore('physical');
    const socialScore = this.calculateCategoryScore('social');

    // 总分 (0-100)
    const totalScore = Math.round((emotionalScore + physicalScore + socialScore) / 3);

    return {
      total: totalScore,
      emotional: emotionalScore,
      physical: physicalScore,
      social: socialScore
    };
  }

  calculateCategoryScore(category) {
    const scores = this.categories[category];
    const sum = scores.reduce((a, b) => a + b, 0);
    const avg = sum / scores.length;
    return Math.round(avg * 10); // 转换为0-100分
  }

  getScoreLevel(score) {
    if (score < 20) return { level: '极低压抑', color: '#28a745', description: '你拥有非常健康开放的性观念，能够自然地接纳和表达自己的性需求，几乎不受社会束缚。' };
    if (score < 40) return { level: '低度压抑', color: '#5cb85c', description: '你的性观念比较开放健康，能够较好地接纳自己，偶尔会受到一些社会观念的影响。' };
    if (score < 60) return { level: '中度压抑', color: '#ffc107', description: '你对性持有一定的保守态度，有时会压抑自己的真实感受，受到社会和传统观念的较大影响。' };
    if (score < 80) return { level: '高度压抑', color: '#ff9800', description: '你对性存在较强的压抑，经常否定或压制自己的正常需求，深受传统道德观念束缚。' };
    return { level: '极度压抑', color: '#f44336', description: '你对性持有极度保守和压抑的态度,几乎完全否定性的正常性,严重影响身心健康,建议寻求专业心理咨询。' };
  }

  showResults() {
    const scores = this.calculateScores();
    const levelInfo = this.getScoreLevel(scores.total);

    // 隐藏问题，显示结果
    document.getElementById('testContent').classList.add('hidden');
    document.getElementById('testResult').classList.remove('hidden');

    // 动画显示分数
    this.animateScore(scores.total);
    this.animateCircle(scores.total);

    // 显示详细信息
    document.getElementById('resultLevel').textContent = levelInfo.level;
    document.getElementById('resultLevel').style.color = levelInfo.color;
    document.getElementById('resultDescription').textContent = levelInfo.description;

    // 显示维度分数
    this.animateBar('emotionalBar', 'emotionalValue', scores.emotional);
    this.animateBar('physicalBar', 'physicalValue', scores.physical);
    this.animateBar('socialBar', 'socialValue', scores.social);

    // 保存到内存
    this.finalScores = scores;
  }

  animateScore(targetScore) {
    const scoreElement = document.getElementById('sriScore');
    let currentScore = 0;
    const increment = targetScore / 50;

    const interval = setInterval(() => {
      currentScore += increment;
      if (currentScore >= targetScore) {
        currentScore = targetScore;
        clearInterval(interval);
      }
      scoreElement.textContent = Math.round(currentScore);
    }, 20);
  }

  animateCircle(score) {
    const circle = document.getElementById('scoreCircle');
    const circumference = 565.48;
    const offset = circumference - (score / 100) * circumference;
    
    setTimeout(() => {
      circle.style.strokeDashoffset = offset;
      circle.style.transition = 'stroke-dashoffset 1.5s ease-out';
      
      // 根据分数改变颜色
      const levelInfo = this.getScoreLevel(score);
      circle.style.stroke = levelInfo.color;
    }, 100);
  }

  animateBar(barId, valueId, score) {
    const bar = document.getElementById(barId);
    const valueSpan = document.getElementById(valueId);
    
    setTimeout(() => {
      bar.style.width = score + '%';
      bar.style.transition = 'width 1s ease-out';
      
      // 根据分数改变颜色
      const levelInfo = this.getScoreLevel(score);
      bar.style.backgroundColor = levelInfo.color;
      
      // 动画数字
      let current = 0;
      const increment = score / 30;
      const interval = setInterval(() => {
        current += increment;
        if (current >= score) {
          current = score;
          clearInterval(interval);
        }
        valueSpan.textContent = Math.round(current);
      }, 20);
    }, 200);
  }
}

// 全局函数
let sriTest;

window.addEventListener('DOMContentLoaded', () => {
  sriTest = new SRITest();
});

async function saveAndClose() {
  if (!sriTest || !sriTest.finalScores) return;

  try {
    // 1. 保存到localStorage（永久保存）
    const sriData = {
      scores: sriTest.finalScores,
      answers: sriTest.answers,
      timestamp: Date.now(),
      date: new Date().toISOString()
    };
    
    if (window.electronAPI && window.electronAPI.storage) {
      await window.electronAPI.storage.set('sriTestResult', sriData);
      console.log('✅ SRI结果已永久保存到storage');
    } else {
      // 降级到localStorage
      localStorage.setItem('sriTestResult', JSON.stringify(sriData));
      console.log('✅ SRI结果已保存到localStorage');
    }

    // 2. 同时保存到IoT管理器（用于当前会话）
    if (window.iotManager) {
      window.iotManager.setSRIScore(sriTest.finalScores.total);
      await window.iotManager.saveSettings();
      console.log('✅ SRI结果已同步到IoT管理器');
    }

    // 3. 通知主窗口
    if (window.electronAPI && window.electronAPI.ipc) {
      await window.electronAPI.ipc.invoke('sri-test-complete', sriTest.finalScores);
    }

    // 4. 广播更新事件给所有窗口（包括IoT面板）
    if (window.electronAPI && window.electronAPI.ipc) {
      await window.electronAPI.ipc.send('sri-data-updated', sriData);
    }

    // 显示保存成功的提示
    if (window.Utils && Utils.showNotification) {
      Utils.showNotification('SRI测试结果已永久保存！', 'success');
    } else {
      alert('SRI测试结果已永久保存！');
    }
    
    setTimeout(() => {
      window.close();
    }, 1000);
  } catch (error) {
    console.error('保存SRI结果失败:', error);
    if (window.Utils && Utils.showNotification) {
      Utils.showNotification('保存失败: ' + error.message, 'error');
    } else {
      alert('保存失败: ' + error.message);
    }
  }
}

function retakeTest() {
  location.reload();
}
