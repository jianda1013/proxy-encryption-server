const httpProxy = require('http-proxy');
const http = require('http');
const express = require('express');
const CryptoJS = require("crypto-js");
const { createDiffieHellman } = require('node:crypto');
const fetch = require('node-fetch');

const { prime, target, port } = require('./client_config.json');
const proxy = httpProxy.createProxyServer({})
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const client_base = createDiffieHellman(prime, 2);
const public_key = client_base.generateKeys().toString("hex");
let share_key = null;

const isValidJSONString = (str) => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

// custom fetch api
const _fetch = async (request, options) => {
    return new Promise((resolve, reject) => {
        fetch(request, options)
            .then(response => response.text())
            .then(data => {
                isValidJSONString(data) ? resolve(JSON.parse(data)) : resolve(data)
            })
            .catch(err => reject(err.message))
    })
}

const keyGen = async () => {
    // get server key
    share_key = await _fetch(`${target}/key_exchange`, {
        method: 'POST',
        body: JSON.stringify({ "key": public_key }),
        headers: { 'Content-Type': 'application/json' }
    }).catch(error => { throw error; });
    // gen the share key
    share_key = client_base.computeSecret(Buffer.from(share_key.key, "hex"));
    return;
}

const reSend = async req => {
    let body = null;
    // decrypt the origin msg by old key
    if (req.body)
        body = CryptoJS.AES.decrypt(req.body.data, share_key.toString("hex")).toString(CryptoJS.enc.Utf8);
    // get new key
    await keyGen().catch(err => { throw err });
    // encrypt by the new key
    if (req.body)
        body = { data: CryptoJS.AES.encrypt(body, share_key.toString("hex")).toString() };
    // resend the request
    body = await _fetch(`${target}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: body ? JSON.stringify(body) : undefined
    }).catch(error => { console.log(error); throw error; });
    // if response is json valid and it's encrypted
    if (body.data)
        body = CryptoJS.AES.decrypt(body.data, share_key.toString("hex")).toString(CryptoJS.enc.Utf8);
    return isValidJSONString(body) ? JSON.parse(body) : body;
}

proxy.on("proxyReq", (proxyReq, req) => {
    if (req.method === "POST" && req.body) {
        // changing request body size
        let bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
    }
})

proxy.on("proxyRes", (proxyRes, req, res) => {
    let body = "";
    proxyRes.on('data', async data => {
        body = data.toString('utf-8');
        // decrypt if and only if response is a json
        if (isValidJSONString(body)) {
            body = JSON.parse(body)?.data;
            body = CryptoJS.AES.decrypt(body, share_key.toString("hex")).toString(CryptoJS.enc.Utf8);
            body = JSON.parse(body);
        }
    });
    proxyRes.on('end', async () => {
        // if key not found then redo the request
        if (body === "NO KEY")
            body = await reSend(req).catch(err => { console.log(err) });
        res.end(body);
    });
})

// end if proxy error
proxy.on("error", (err, req, res) => {
    res.end(err.message);
})

app.use(async (req, res) => {
    // if share key not found
    if (!share_key)
        await keyGen().catch(err => res.end(err));
    // encrypt if request have body
    if (req.body)
        req.body = { data: CryptoJS.AES.encrypt(JSON.stringify(req.body), share_key.toString("hex")).toString() };
    proxy.web(req, res, { target, selfHandleResponse: true })
});

http.createServer(app).listen(port, '0.0.0.0', () => {
    console.log(`Proxy client linsten on ${port}`);
});