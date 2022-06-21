const httpProxy = require('http-proxy');
const http = require('http');
const express = require('express');
const CryptoJS = require("crypto-js");
const { createDiffieHellman } = require('node:crypto');
const fetch = require('node-fetch');
const config = require('./client_config.json');

const proxy = httpProxy.createProxyServer({})
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let target = 'http://127.0.0.1:8080'

const client_base = createDiffieHellman(config.prime, 2);
const public_key = client_base.generateKeys().toString("hex");
let share_key = null;

const keyGen = async () => {
    let response = await fetch(`${target}/key_exchange`, {
        method: 'POST',
        body: JSON.stringify({ "key": public_key }),
        headers: { 'Content-Type': 'application/json' }
    });
    share_key = await response.json()
    share_key = client_base.computeSecret(Buffer.from(share_key.key, "hex"));
    return;
}

proxy.on("proxyReq", (proxyReq, req, res) => {
    if (req.method === "POST" && req.body) {
        let bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
    }
})

proxy.on("proxyRes", (proxyRes, req, res) => {
    let _write = res.write, body = "";
    proxyRes.on('data', data => {
        data = data.toString('utf-8');
        try {
            data = JSON.parse(data)?.data;
            data = CryptoJS.AES.decrypt(data, share_key.toString("hex")).toString(CryptoJS.enc.Utf8);
            body = JSON.parse(data);
        } catch (err) {
            res.end(data);
        }
    });
    res.write = () => {
        if (body.length) {
            res.setHeader('content-length', body.length);
            _write.call(res, body);
        }
    }
})

proxy.on("error", (err, req, res) => {
    res.end(err.message);
})

app.post('/key_exchange', (req, res) => {
    keysMap[req.ip] = server_base.computeSecret(Buffer.from(req.body.key, "hex"));
    console.log(keysMap[req.ip].toString("hex"));
    res.json({ key: master_public_key });
})

app.use(async (req, res) => {
    if (!share_key) await keyGen();
    req.body = { data: CryptoJS.AES.encrypt(JSON.stringify(req.body), share_key.toString("hex")).toString() };
    proxy.web(req, res, { target })
});

http.createServer(app).listen(1337, '0.0.0.0', () => {
    console.log('Proxy client linsten on 1337');
});