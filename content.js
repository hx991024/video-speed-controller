// 存储当前页面的播放速度
let currentSpeed = 1.0

// 初始化时从存储中获取该页面的播放速度
chrome.storage.local.get([window.location.hostname], function (result) {
  if (result[window.location.hostname]) {
    currentSpeed = result[window.location.hostname]
    updateAllVideoSpeeds(currentSpeed)
  }
})

// 添加一个包装函数来处理消息发送
function sendMessageToBackground(message) {
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.log('发送消息时出错:', chrome.runtime.lastError.message)
      }
    })
  } catch (error) {
    console.log('发送消息失败:', error)
    // 如果扩展已失效，尝试重新加载页面
    if (error.message.includes('Extension context invalidated')) {
      console.log('扩展已重新加载，请刷新页面')
    }
  }
}

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
        // 使用新的包装函数
        sendMessageToBackground({
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
    // 检查是否有视频元素
    const videos = document.querySelectorAll('video')
    sendResponse({ exists: videos.length > 0 })
    return false // 同步响应
  }

  if (request.action === 'changeSpeed') {
    const videos = document.getElementsByTagName('video')
    if (videos.length > 0) {
      videos[0].playbackRate = request.speed
      // 存储当前播放速度
      chrome.storage.local.set({ playbackSpeed: request.speed })
    }
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

  const originalSet = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'playbackRate'
  ).set

  // 设置初始速度
  originalSet.call(video, speed)

  // 修改速度监听器逻辑
  video._speedHandler = function (e) {
    // 只在非用户手动修改的情况下应用速度
    if (e.type !== 'ratechange') {
      if (this.playbackRate !== speed) {
        originalSet.call(this, speed)
      }
    } else {
      // 如果是用户手动修改速度，更新 currentSpeed
      currentSpeed = this.playbackRate
      // 保存新的速度设置
      chrome.storage.local
        .set({
          [window.location.hostname]: currentSpeed
        })
        .then(() => {
          // 使用新的包装函数
          sendMessageToBackground({
            action: 'speedUpdated',
            speed: currentSpeed
          })
        })
    }
  }

  // 移除 play 事件，只保留必要的事件监听
  const events = [
    'ratechange',
    'seeking',
    'loadeddata',
    'loadedmetadata',
    'canplay'
  ]
  events.forEach((eventName) => {
    video.addEventListener(eventName, video._speedHandler)
  })

  // 修改 timeupdate 监听逻辑
  video.addEventListener('timeupdate', function () {
    // 不再强制设置速度，让用户的手动设置优先
  })
}

// 优化后的 MutationObserver
const observer = new MutationObserver((mutations) => {
  let videoFound = false
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeName === 'VIDEO') {
        videoFound = true
        applySpeedToVideo(node, currentSpeed)
      } else if (node.querySelectorAll) {
        const videos = node.querySelectorAll('video')
        if (videos.length > 0) {
          videoFound = true
          videos.forEach((video) => applySpeedToVideo(video, currentSpeed))
        }
      }
    })
  })

  if (videoFound) {
    // 使用新的包装函数
    sendMessageToBackground({
      action: 'speedUpdated',
      speed: currentSpeed
    })
  }
})

// 配置 observer 以捕获更多变化
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['src', 'currentSrc']
})

// 优化检查间隔时间，并添加更多检查逻辑
setInterval(() => {
  const videos = document.querySelectorAll('video')
  videos.forEach((video) => {
    if (!video._speedHandler || video.playbackRate !== currentSpeed) {
      applySpeedToVideo(video, currentSpeed)
    }
  })
}, 500) // 缩短间隔时间以提高响应速度

// 页面可见性变化时的处理
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    setTimeout(() => updateAllVideoSpeeds(currentSpeed), 100)
  }
})

// 添加消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSpeed') {
    // 返回当前视频速度
    const video = document.querySelector('video')
    sendResponse({ speed: video ? video.playbackRate : 1.0 })
  } else if (request.action === 'setSpeed') {
    // 设置视频速度
    const videos = document.querySelectorAll('video')
    videos.forEach((video) => {
      applySpeedToVideo(video, request.speed)
    })
    // 使用新的包装函数
    sendMessageToBackground({
      action: 'speedUpdated',
      speed: request.speed
    })
    sendResponse({ success: true })
  }
  return true // 保持消息通道开启
})
