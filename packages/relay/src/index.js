require('dotenv').config()

const Koa = require('koa')
const Router = require('@koa/router')
const json = require('koa-json')
const body = require('koa-json-body')

const {DefenderProvider} = require('./provider.js')
const {Relayer} = require('./relayer.js')

const DEFENDER_API_KEY = process.env.DEFENDER_API_KEY
const DEFENDER_API_SECRET = process.env.DEFENDER_API_SECRET
const PORT = process.env.PORT

const app = new Koa()
const router = new Router()
const provider = new DefenderProvider()
const relayer = new Relayer()

router.post('/relay', async ctx => {
    ctx.body = await relayer.relay(ctx.request.body)
})

router.post('/sign', async ctx => {

})

router.get('/transaction/:id', async ctx => {
    ctx.body = await provider.getProvider().query(ctx.params.id)
})

app.use(body())
app.use(json())
app.use(router.routes())

async function main() {
    await setup()
    return {
        app: app.listen(PORT),
        relayer: relayer,
        provider: provider
    }
}

module.exports = main

async function setup() {
    if (!DEFENDER_API_KEY || !DEFENDER_API_SECRET) {
        throw new Error("Provide credentials for relay service")
    }

    let credentials = { apiKey: DEFENDER_API_KEY, apiSecret: DEFENDER_API_SECRET }

    provider.createProvider(credentials)
    await relayer.createForwarder(provider.getProvider())
}
