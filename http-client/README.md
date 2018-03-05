# HTTP Client for BLE Proxy

#### This client will be used for establishing remote connections to the CoAP server allowing for interactions with bluetooth devices.

Built using:
  - NodeJS
  - Node-CoAP
  - ExpressJS
  - HTML & CSS

Possible Additions: Express-Handlebars

### Flow

- [x] Home page takes in a IP address, which is verified using an IPv4 and IPv6 regex
- [x] The server makes a `GET` request to `coap://<ip>/.well-known/core` to retrieve all of the discovered peripherals
- [ ] The returned JSON is converted into an`interactive list. Each item is a peripheral, selecting it introduces an interaction panel for that device.
