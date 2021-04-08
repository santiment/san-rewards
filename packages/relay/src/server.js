const Koa = require('koa')
const Router = require('@koa/router')
const json = require('koa-json')
const body = require('koa-json-body')
const logger = require('koa-logger')

const {DefenderProvider} = require('./provider.js')
const {Forwarder} = require('./forwarder.js')

const DEFENDER_API_KEY = process.env.DEFENDER_API_KEY
const DEFENDER_API_SECRET = process.env.DEFENDER_API_SECRET
const PORT = 3000

async function main() {

    const app = new Koa()
    const router = new Router()
    const provider = new DefenderProvider()
    const forwarder = new Forwarder()

    await setup(provider, forwarder)

    router.post('/relay', async ctx => {
        ctx.body = await forwarder.relay(ctx.request.body)
    })

    router.get('/', async ctx => {
        ctx.body = await provider.getRelayer().getRelayer()
    })

    router.get('/transaction/:id', async ctx => {
        ctx.body = await provider.getRelayer().query(ctx.params.id)
    })

    app.use(logger())
    app.use(body())
    app.use(json())
    app.use(router.routes())


    return {
        app: app.listen(PORT, () => console.log(`Listen on ${PORT}`)),
        forwarder,
        provider
    }
}

module.exports = main

async function setup(provider, forwarder) {
    if (!DEFENDER_API_KEY || !DEFENDER_API_SECRET) {
        throw new Error("Provide credentials for relay service")
    }

    let credentials = { apiKey: DEFENDER_API_KEY, apiSecret: DEFENDER_API_SECRET }

    await provider.createProvider(credentials)
    await forwarder.createForwarder(provider.getProvider())
}
