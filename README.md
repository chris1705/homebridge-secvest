# homebridge-secvest
ABUS Secvest plugin for homebridge. It supports the [Secvest FUAA50000](http://amzn.to/2kKdcvU) only. Other models are not supported.

## Installation
1. Install plugin with `npm install -g chris1705/homebridge-secvest`
2. Add platform within `config.json` of you homebridge instance:

    ```
    {
        "platform": "Secvest",
        "host": "192.168.1.2",
        "username": "User",
        "password": "1234"
    }
    ```
3. Restart homebridge
4. Enjoy!

