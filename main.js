const fs = require('fs')
const https = require('https')
const fetch = require('node-fetch')
const express = require('express')
const bodyParser = require('body-parser')


const app = express()
const MOPIDY_HOST = 'http://localhost:6680/mopidy/rpc'
app.use(bodyParser.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded
app.use(bodyParser.json()) // for parsing application/json

const verifyChannel = (req, res, next) => {
  if (req.body.channel_name !== 'cts-la-music') {
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
        console.log('sent', body, ' - result', result)
        if (error) {
          console.error('error', error)
          return Promise.reject(error.message)
        }
        return result
      })
  }
})()

app.post('/play', (req, res) => {
  // TODO play a specific URI
  let promise
  if (req.body.text) {
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
    .then(() => res.sendStatus(200))
    .catch(err => res.status(500).send(err))
})

app.post('/queue', (req, res) => {
  mopidyCommand('queue', req.body.text)
    .then(() => res.sendStatus(200))
    .catch(err => res.status(500).send(err))
})

app.post('/pause', (req, res) => {
  mopidyCommand('pause')
    .then(() => res.sendStatus(200))
    .catch(err => res.status(500).send(err))
})

app.post('/skip', (req, res) => {
  mopidyCommand('skip')
    .then(() => res.sendStatus(200))
    .catch(err => res.status(500).send(err))
})

app.post('/volume', (req, res) => {
  mopidyCommand('volume', Number(req.body.text) * 10)
    .then(() => res.sendStatus(200))
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
