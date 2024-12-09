// 存储当前页面的播放速度
let currentSpeed = 1.0

// 更新所有视频的播放速度
function updateAllVideoSpeeds(speed) {
  const videos = document.querySelectorAll('video')
  videos.forEach((video) => applySpeedToVideo(video, speed))
}

// 初始化时从存储中获取该页面的播放速度
chrome.storage.local.get([window.location.hostname], function (result) {
  if (result[window.location.hostname]) {
    currentSpeed = result[window.location.hostname]
    updateAllVideoSpeeds(currentSpeed)
  }
})

// 添加重试机制的包装函数
function sendMessageWithRetry(message, maxRetries = 3, delay = 1000) {
  let retries = 0

  function attemptSend() {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.log('发送消息时出错:', chrome.runtime.lastError.message)
          if (
            retries < maxRetries &&
            chrome.runtime.lastError.message.includes(
              'Extension context invalidated'
            )
          ) {
            retries++
            setTimeout(attemptSend, delay)
          }
        }
      })
    } catch (error) {
      console.log('发送消息失败:', error)
      // 如果是扩展上下文失效，尝试重试
      if (
        retries < maxRetries &&
        error.message.includes('Extension context invalidated')
      ) {
        retries++
        setTimeout(attemptSend, delay)
      }
    }
  }

  attemptSend()
}

// 替换原有的 sendMessageToBackground 函数
function sendMessageToBackground(message) {
  sendMessageWithRetry(message)
}

// 添加存储操作的错误处理和重试机制
function saveSpeedWithRetry(speed, maxRetries = 3, delay = 1000) {
  let retries = 0

  return new Promise((resolve, reject) => {
    function attemptSave() {
      chrome.storage.local
        .set({
          [window.location.hostname]: speed
        })
        .then(() => {
          resolve()
        })
        .catch((error) => {
          console.error('保存速度设置失败:', error)
          if (retries < maxRetries) {
            retries++
            setTimeout(attemptSave, delay)
          } else {
            reject(error)
          }
        })
    }

    attemptSave()
  })
}

// 合并所有消息监听逻辑到一个监听器中
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    switch (request.action) {
      case 'setSpeed':
        currentSpeed = request.speed
        updateAllVideoSpeeds(currentSpeed)
        // 保存当前网站的播放速度
        saveSpeedWithRetry(currentSpeed)
          .then(() => {
            sendMessageWithRetry({
              action: 'speedUpdated',
              speed: currentSpeed
            })
            sendResponse({ success: true })
          })
          .catch((error) => {
            console.error('保存速度最终失败:', error)
            sendResponse({ success: false, error: error.message })
          })
        return true // 异步响应

      case 'getSpeed':
        try {
          const video = document.querySelector('video')
          sendResponse({ speed: video ? video.playbackRate : currentSpeed })
        } catch (error) {
          console.error('获取速度失败:', error)
          sendResponse({ speed: currentSpeed })
        }
        return false

      case 'hasVideo':
        try {
          const videos = document.querySelectorAll('video')
          sendResponse({ exists: videos.length > 0 })
        } catch (error) {
          console.error('检查视频存在失败:', error)
          sendResponse({ exists: false })
        }
        return false

      case 'changeSpeed':
        try {
          const targetVideos = document.getElementsByTagName('video')
          if (targetVideos.length > 0) {
            targetVideos[0].playbackRate = request.speed
            saveSpeedWithRetry(request.speed)
          }
        } catch (error) {
          console.error('改变速度失败:', error)
        }
        return false
    }
  } catch (error) {
    console.error('消息处理失败:', error)
    sendResponse({ error: error.message })
  }
  return true
})

// 为单个视频应用速度设置
function applySpeedToVideo(video, speed) {
  // 清理所有之前的事件监听器
  const events = [
    'ratechange',
    'seeking',
    'loadeddata',
    'loadedmetadata',
    'canplay',
    'play',
    'playing',
    'loadstart'
  ]

  // 清理之前的所有事件监听器
  events.forEach((eventName) => {
    if (video[`_${eventName}Handler`]) {
      video.removeEventListener(eventName, video[`_${eventName}Handler`])
    }
  })

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
          sendMessageToBackground({
            action: 'speedUpdated',
            speed: currentSpeed
          })
        })
    }
  }

  // 添加 loadstart 事件监听，在视频源改变时应用速度
  video.addEventListener('loadstart', function () {
    setTimeout(() => {
      if (this.playbackRate !== speed) {
        originalSet.call(this, speed)
      }
    }, 100)
  })

  // 清理之前的观察器
  if (video._srcObserver) {
    video._srcObserver.disconnect()
  }

  const srcObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (
        mutation.type === 'attributes' &&
        (mutation.attributeName === 'src' ||
          mutation.attributeName === 'currentSrc')
      ) {
        setTimeout(() => {
          if (video.playbackRate !== speed) {
            originalSet.call(video, speed)
          }
        }, 100)
      }
    })
  })

  // 保存观察器引用以便后续清理
  video._srcObserver = srcObserver

  srcObserver.observe(video, {
    attributes: true,
    attributeFilter: ['src', 'currentSrc']
  })

  // 添加视频元素移除时的清理逻辑
  const cleanupObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === video) {
          if (video._srcObserver) {
            video._srcObserver.disconnect()
          }
          cleanupObserver.disconnect()
        }
      })
    })
  })

  cleanupObserver.observe(document.body, {
    childList: true,
    subtree: true
  })

  // 监听播放状态变化
  video.addEventListener('play', function () {
    setTimeout(() => {
      if (this.playbackRate !== speed) {
        originalSet.call(this, speed)
      }
    }, 100)
  })

  // 保存事件处理函数的引用
  events.forEach((eventName) => {
    video[`_${eventName}Handler`] = video._speedHandler
    video.addEventListener(eventName, video._speedHandler)
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

// 页面可见性变化时的处理
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    setTimeout(() => updateAllVideoSpeeds(currentSpeed), 100)
  }
})
