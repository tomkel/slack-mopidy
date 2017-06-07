const fs = require('fs')
const https = require('https')
const fetch = require('node-fetch')
const express = require('express')
const bodyParser = require('body-parser')


const app = express()
const MOPIDY_HOST = 'http://localhost:6680/mopidy/rpc'
app.use(bodyParser.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded
app.use(bodyParser.json()) // for parsing application/json

const logRequests = (req, res, next) => {
  console.log(req.url, req.body)
  next()
}
app.use(logRequests)

const verifyChannel = (req, res, next) => {
  if (req.body.channel_id !== 'G5P8SJYKH') {
    res.status(500).send('Only for LA')
  } else {
    next()
  }
}
app.use(verifyChannel)

const commandEncode = {
  play: 'core.playback.play',
  pause: 'core.playback.pause',
  resume: 'core.playback.resume',
  skip: 'core.playback.next',
  getPlaybackState: 'core.playback.get_state',
  setPlaybackState: 'core.playback.set_state',
  queue: 'core.tracklist.add',
  clear: 'core.tracklist.clear',
  volume: 'core.mixer.set_volume',
}

const paramEncode = (command, arg) => {
  switch (command) {
    case 'queue': return { uri: arg }
    case 'volume': return { volume: arg }
    case 'setPlaybackState': return { new_state: arg }
    default: return {}
  }
}

const mopidyCommand = (() => {
  let commandId = 1

  return (command, arg) => {
    let body = {
      jsonrpc: '2.0',
      id: commandId,
      method: commandEncode[command],
    }
    if (arg) {
      body.params = paramEncode(command, arg)
    }
    commandId += 1

    body = JSON.stringify(body)

    return fetch(MOPIDY_HOST, { method: 'POST', body })
      .then(res => res.json())
      .then(({ error, result }) => {
        console.log('sent', body, '- result -', result)
        if (error) {
          console.error('error', error)
          return Promise.reject(error.message)
        }
        return result
      })
  }
})()

const inChannelResponse = (res, text = "Success!") => {
  const responseData = {
    response_type: "in_channel",
    text,
  }
  res.status(200).send(responseData)
}

app.post('/play', (req, res) => {
  // TODO play a specific URI
  let promise
  if (req.body.text && req.body.text.includes('spotify')) {
    promise = mopidyCommand('clear')
      .then(() => mopidyCommand('queue', req.body.text))
  } else {
    promise = Promise.resolve()
  }
  promise.then(() => mopidyCommand('getPlaybackState'))
    .then((playbackState) => {
      if (playbackState === 'stopped') {
        return mopidyCommand('play')
      } else if (playbackState === 'paused') {
        return mopidyCommand('resume')
      }
      return null
    })
    .then(() => inChannelResponse(res))
    .catch(err => res.status(500).send(err))
})

app.post('/queue', (req, res) => {
  if (!res.body.text.includes('spotify')) {
    res.status(500).send('Bad Spotify URI')
  } else {
    mopidyCommand('queue', req.body.text)
      .then(() => inChannelResponse(res, `Song queued`))
      .catch(err => res.status(500).send(err))
  }
})

app.post('/pause', (req, res) => {
  mopidyCommand('pause')
    .then(() => inChannelResponse(res, `Music paused`))
    .catch(err => res.status(500).send(err))
})

app.post('/skip', (req, res) => {
  mopidyCommand('skip')
    .then(() => inChannelResponse(res, `Song skipped`))
    .catch(err => res.status(500).send(err))
})

app.post('/volume', (req, res) => {
  if (!req.body.text) {
    //mopidyCommand('getVolume')
  }
  mopidyCommand('volume', Number(req.body.text) * 10)
    .then(() => inChannelResponse(res, `Volume set to ${req.body.text}`))
    .catch(err => res.status(500).send(err))
})

//const httpsOptions = {
//  key: fs.readFileSync('path/to/private.key'),
//  cert: fs.readFileSync('path/to/certificate.pem'),
//}
//https.createServer(httpsOptions, app).listen(443, () => {
//  console.log('slack-mopidy listening on port 443')
//})
app.listen(3000, () => {
  console.log('slack-mopidy listening on port 3000')
})
