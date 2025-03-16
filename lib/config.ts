import * as dotenv from "dotenv";
import * as path from "path";

class Config {
    constructor() {
        dotenv.config({ path: path.resolve(__dirname, "../.env") });

        return new Proxy(this, {
            get: function (target, prop, receiver) {
                if (typeof target[prop] === 'undefined') {
                    return new Proxy(function () {}, {
                        apply: function (innerTarget, thisArg, argsList) {
                            return process.env[snakeCase(prop)];
                        }
                    })
                }
            }
        });
    }
}

function snakeCase(text: any) {
    let transformed = text.match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
        ?.join('_');

    return transformed?.toUpperCase();
}

export default new Config;
