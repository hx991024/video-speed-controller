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
    // 检查页���是否有视频元素
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

  // 增强版速度监听器
  video._speedHandler = function (e) {
    if (this.playbackRate !== speed) {
      originalSet.call(this, speed)
    }
  }

  // 添加更全面的事件监听
  const events = [
    'ratechange',
    'play',
    'seeking',
    'loadeddata',
    'loadedmetadata',
    'canplay'
  ]
  events.forEach((eventName) => {
    video.addEventListener(eventName, video._speedHandler)
  })

  // 添加 timeupdate 监听以确保持续保持速度
  video.addEventListener('timeupdate', function () {
    if (this.playbackRate !== speed) {
      originalSet.call(this, speed)
    }
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
    // 通知 background 更新 badge
    chrome.runtime.sendMessage({
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
