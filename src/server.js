const httpProxy = require('http-proxy');
const http = require('http');
const express = require('express');
const CryptoJS = require("crypto-js");
const { createDiffieHellman } = require('node:crypto');
const fetch = require('node-fetch');
const config = require('./server_config.json');

const keysMap = {};

const proxy = httpProxy.createProxyServer({})
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server_base = createDiffieHellman(config.prime, 2);
const master_public_key = server_base.generateKeys().toString("hex");

// const keyGen = async (ip) => {
//     let response = await fetch(`${ip}/key_exchange`, {
//         method: 'POST',
//         body: JSON.stringify({ "key": master_public_key }),
//         headers: { 'Content-Type': 'application/json' }
//     });
//     let share_key = await response.json()
//     keysMap[ip] = client_base.computeSecret(Buffer.from(share_key.key, "hex"));
//     return;
// }

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
        data = { data: CryptoJS.AES.encrypt(JSON.stringify(data), keysMap[req.ip].toString("hex")).toString() };
        body = JSON.stringify(data);
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
    res.json({ key: master_public_key });
})

app.use(async (req, res) => {
    console.log(req.body);
    // if (!keysMap[req.ip])
    //     await fetch(`${req.ip}:8080/key_exchange`, { method: 'POST', body: { key: server_base.generateKeys() } });
    req.body = CryptoJS.AES.decrypt(req.body.data, keysMap[req.ip].toString("hex")).toString(CryptoJS.enc.Utf8);
    req.body = JSON.parse(req.body);
    proxy.web(req, res, { target: 'http://127.0.0.1:8181' })
});

http.createServer(app).listen(8080, '0.0.0.0', () => {
    console.log('Proxy server linsten on 8080');
});