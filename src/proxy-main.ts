/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Open Mainframe Project's TSTerm Project
*/

import * as express from 'express';
import { Request, Response } from 'express';
let expressWs = require('@rocketsoftware/express-ws');
import * as path from 'path';
import * as termproxy from './termproxy';

const app = express()
expressWs = expressWs(app);
const port = parseInt(process.argv[2]);

function demoLogger(req: Request, res: Response, next: () => void) {
    const current_datetime = new Date();
    const formatted_date = current_datetime.getFullYear() +
        "-" +
        (current_datetime.getMonth() + 1) +
        "-" +
        current_datetime.getDate() +
        " " +
        current_datetime.getHours() +
        ":" +
        current_datetime.getMinutes() +
        ":" +
        current_datetime.getSeconds();
    const method = req.method;
    const url = req.url;
    const status = res.statusCode;
    const log = `[${formatted_date}] ${method}:${url} ${status}`;
    console.log(log);
    next();
}

const run = function () {
    console.log("run the proxy");
    app.use(demoLogger);
    app.get('/', (req, res) => {
        res.send('You found the Root Page - Big Deal')
    });

    console.log('dirname', __dirname);
    app.use('/static', express.static(path.join(__dirname, '../static')));

    app.listen(port, () => {
        console.log(`Example app listening at http://localhost:${port}`)
    });

    (app as any).ws('/echo', function (ws: any, req: Request) {
        ws.on('message', function (msg: any) {
            ws.send(msg);
        });
    });

    expressWs.applyTo(express.Router);

    const logger = termproxy.makeDumbLogger();
    // context.plugin.server.config.user.node.https;
    const context = {
        logger: logger,
        plugin: { server: { config: { user: { node: {} } } } }
    };
    const routerPromise = termproxy.tn3270WebsocketRouter(context);
    console.log("made termproxy router promise " + routerPromise);
    routerPromise.then(function (router: any) {
        console.log("router promise resolved " + router);
        app.use("/tn3270", router);

        let route: any;
        const routes: any[] = [];

        console.log("router stack " + JSON.stringify(router.stack));

        app._router.stack.forEach(function (middleware: any) {
            if (middleware.route) { // routes registered directly on the app
                routes.push(middleware.route);
            } else if (middleware.name === 'router') { // router middleware 
                middleware.handle.stack.forEach(function (handler: any) {
                    route = handler.route;
                    route && routes.push(route);
                });
            }
        });

        console.log("express dump " + JSON.stringify(routes));

    }),
        function () {
            console.log("promise rejected, author dejected");
        }


    console.log("end of main.run()");

}

run();
