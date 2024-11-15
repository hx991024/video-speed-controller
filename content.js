// 存储当前页面的播放速度
let currentSpeed = 1.0

// 初始化时从存储中获取该页面的播放速度
chrome.storage.local.get([window.location.hostname], function (result) {
  if (result[window.location.hostname]) {
    currentSpeed = result[window.location.hostname]
    updateAllVideoSpeeds(currentSpeed)
  }
})

// 监听来自popup和background的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'setSpeed') {
    currentSpeed = request.speed
    updateAllVideoSpeeds(currentSpeed)
    // 保存当前网站的播放速度
    chrome.storage.local
      .set({
        [window.location.hostname]: currentSpeed
      })
      .then(() => {
        // 通知background更新badge
        chrome.runtime.sendMessage({
          action: 'speedUpdated',
          speed: currentSpeed
        })
        sendResponse({ success: true })
      })
    return true // 异步响应
  }

  if (request.action === 'getSpeed') {
    sendResponse({ speed: currentSpeed })
    return false // 同步响应
  }

  if (request.action === 'hasVideo') {
    // 检查页面是否有视频元素
    const videos = document.querySelectorAll('video')
    sendResponse({ exists: videos.length > 0 })
    return false // 同步响应
  }
})

// 更新所有视频的播放速度
function updateAllVideoSpeeds(speed) {
  const videos = document.querySelectorAll('video')
  videos.forEach((video) => {
    applySpeedToVideo(video, speed)
  })
}

// 为单个视频应用速度设置
function applySpeedToVideo(video, speed) {
  // 移除现有的速度监听器
  if (video._speedHandler) {
    video.removeEventListener('ratechange', video._speedHandler)
  }

  // 重置playbackRate属性
  try {
    delete video.playbackRate
    // 重新定义playbackRate属性
    Object.defineProperty(video, 'playbackRate', {
      configurable: true,
      get: function () {
        return speed
      },
      set: function (newValue) {
        if (newValue !== speed) {
          const originalSet = Object.getOwnPropertyDescriptor(
            HTMLMediaElement.prototype,
            'playbackRate'
          ).set
          originalSet.call(this, speed)
        }
      }
    })
  } catch (e) {
    console.log('无法劫持playbackRate属性，使用备用方案')
  }

  // 设置初始速度
  const originalSet = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'playbackRate'
  ).set
  originalSet.call(video, speed)

  // 添加新的速度监听器
  video._speedHandler = function (e) {
    if (this.playbackRate !== speed) {
      originalSet.call(this, speed)
    }
  }
  video.addEventListener('ratechange', video._speedHandler)

  // 添加播放事件监听器
  video.addEventListener('play', function () {
    if (this.playbackRate !== speed) {
      originalSet.call(this, speed)
    }
  })

  // 添加seeking事件监听器
  video.addEventListener('seeking', function () {
    if (this.playbackRate !== speed) {
      originalSet.call(this, speed)
    }
  })
}

// 监听新添加的视频元素
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeName === 'VIDEO') {
        applySpeedToVideo(node, currentSpeed)
        // 通知background更新badge
        chrome.runtime.sendMessage({
          action: 'speedUpdated',
          speed: currentSpeed
        })
      }
    })
  })
})

observer.observe(document.body, {
  childList: true,
  subtree: true
})

// 初始检查是否存在视频
if (document.querySelectorAll('video').length > 0) {
  chrome.runtime.sendMessage({ action: 'speedUpdated', speed: currentSpeed })
}

// 定期检查并强制更新视频速度
setInterval(() => {
  const videos = document.querySelectorAll('video')
  videos.forEach((video) => {
    if (video.playbackRate !== currentSpeed) {
      const originalSet = Object.getOwnPropertyDescriptor(
        HTMLMediaElement.prototype,
        'playbackRate'
      ).set
      originalSet.call(video, currentSpeed)
    }
  })
}, 1000)

// 页面可见性改变时重新应用速度设置
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    updateAllVideoSpeeds(currentSpeed)
  }
})
