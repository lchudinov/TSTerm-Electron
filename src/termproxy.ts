/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
  Copyright Contributors to the Open Mainframe Project's TSTerm Project
*/

import * as express from 'express';
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const fs = require('fs');
const pathModule = require('path');
const ssh = require('./ssh');
const SSH_MESSAGE = ssh.MESSAGE;

var expressWs = require('@rocketsoftware/express-ws');
var expressWs = expressWs(express());


const base64BitValues = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3e, 0x00, 0x00, 0x00, 0x3f,
  0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
  0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x32, 0x33, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

const WS_READY_STATE_CONNECTING = 0;
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
const WS_READY_STATE_CLOSED = 3;

const WS_CLOSE_MESSAGE_LENGTH_LIMIT = 123;

const SECURITY_BAD_CERTIFICATE_PROMPT = 1;
const SECURITY_BAD_CERTIFICATE_ALLOW = 0;

const WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR = 4999;
const WEBSOCKET_REASON_TERMPROXY_GOING_AWAY = 4000;

const utf8ArrayToB64 = function (data: Buffer) {
  const out = [];
  const start = 0;
  const length = data.length;

  const dataLen = data.length;
  const numFullGroups = Math.floor(dataLen / 3);
  const numBytesInPartialGroup = dataLen - 3 * numFullGroups;
  let inCursor = 0;

  // Translate all full groups from byte array elements to Base64
  for (let i = 0; i < numFullGroups; i++) {
    const byte0 = data[inCursor++] & 0xff;
    const byte1 = data[inCursor++] & 0xff;
    const byte2 = data[inCursor++] & 0xff;
    out.push(binToB64[byte0 >> 2]);
    out.push(binToB64[(byte0 << 4) & 0x3f | (byte1 >> 4)]);
    out.push(binToB64[(byte1 << 2) & 0x3f | (byte2 >> 6)]);
    out.push(binToB64[byte2 & 0x3f]);
  }

  // Translate partial group if present
  if (numBytesInPartialGroup != 0) {
    const byte0 = data[inCursor++] & 0xff;
    out.push(binToB64[byte0 >> 2]);
    if (numBytesInPartialGroup == 1) {
      out.push(binToB64[(byte0 << 4) & 0x3f]);
      out.push(0x3d);
      out.push(0x3d);
    }
    else {
      const byte1 = data[inCursor++] & 0xff;
      out.push(binToB64[(byte0 << 4) & 0x3f | (byte1 >> 4)]);
      out.push(binToB64[(byte1 << 2) & 0x3f]);
      out.push(0x3d);
    }
  }


  return String.fromCharCode.apply(null, out);
}

const base64ToUint8Array = function (s: string) {
  const sLen = s.length;
  const numGroups = sLen / 4;
  let missingBytesInLastGroup = 0;
  let numFullGroups = numGroups;
  let inCursor = 0, outCursor = 0;
  let i = 0;

  if (4 * numGroups != sLen) {
    return null;
  }

  if (sLen != 0) {
    if (s[sLen - 1] == '=') {
      missingBytesInLastGroup++;
      numFullGroups--;
    }
    if (s[sLen - 2] == '=') {
      missingBytesInLastGroup++;
    }
  }
  let resultLength = numFullGroups * 3;
  if (missingBytesInLastGroup != 0) {
    resultLength++;
  }
  if (missingBytesInLastGroup == 1) {
    resultLength++;
  }
  const result = new Uint8Array(resultLength);

  /* Translate all full groups from base64 to byte array elements */
  for (i = 0; i < numFullGroups; i++) {
    const ch0 = base64BitValues[s.charCodeAt(inCursor++)];
    const ch1 = base64BitValues[s.charCodeAt(inCursor++)];
    const ch2 = base64BitValues[s.charCodeAt(inCursor++)];
    const ch3 = base64BitValues[s.charCodeAt(inCursor++)];
    const x = ((ch0 << 2) | (ch1 >> 4));
    result[outCursor++] = ((ch0 << 2) | (ch1 >> 4));
    result[outCursor++] = ((ch1 << 4) | (ch2 >> 2));
    result[outCursor++] = ((ch2 << 6) | ch3);
  }

  /* Translate partial group, if present */
  if (missingBytesInLastGroup != 0) {
    const ch0 = base64BitValues[s.charCodeAt(inCursor++)];
    const ch1 = base64BitValues[s.charCodeAt(inCursor++)];
    result[outCursor++] = ((ch0 << 2) | (ch1 >> 4));

    if (missingBytesInLastGroup == 1) {
      const ch2 = base64BitValues[s.charCodeAt(inCursor++)];
      result[outCursor++] = ((ch1 << 4) | (ch2 >> 2));
    }
  }

  return result;
}

class DumbLogger {
  warn(msgID: string, msg: string) {
    console.log(msgID + ": " + msg);
  }

  debug(msgID: string, msg: string) {
    console.log(msgID + ": " + msg);
  }

  info(msgID: string, msg: string) {
    console.log(msgID + ": " + msg);
  }

  trace(msgID: string, idString: string, msg: string) {
    console.log(msgID + ": (" + idString + ") " + msg);
  }
}

const binToB64 = [0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4A, 0x4B, 0x4C, 0x4D, 0x4E, 0x4F, 0x50,
  0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66,
  0x67, 0x68, 0x69, 0x6A, 0x6B, 0x6C, 0x6D, 0x6E, 0x6F, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76,
  0x77, 0x78, 0x79, 0x7A, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x2B, 0x2F];

class TerminalWebsocketProxy {

  hostConnected = false;
  logger: DumbLogger;
  configured = false;
  handlers: any;
  clientIP: string;
  host: string;
  hostPort: number;
  hostSocket: any;
  usingSSH = false;
  sshSessionData: any;
  bufferedHostMessages: any[];
  ws: any;
  hostTypeKey: any;
  hostDataKey: any;
  clientTypeKey: any;
  clientDataKey: any;
  port: number;
  awaitingCertificateVerification: any;
  outstandingCertFingerprint: any;
  websocket: any;
  securitySettings: any;
  usingTLS: boolean;
  static securityObjects: any;

  constructor(messageConfig: any, clientIP: string, context: { logger: DumbLogger }, websocket: any, handlers: any) {
    websocket.on('error', (error: any) => {
      this.logger.warn("ZWED0129W", error); //this.logger.warn("websocket error", error);
      this.closeConnection(websocket, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR, 'websocket error occurred');
    });
    websocket.on('close', (code: number, reason: number) => {
      this.handleWebsocketClosed(code, reason);
    });

    this.handlers = handlers;
    this.host;
    this.hostPort;
    this.hostSocket;
    this.usingSSH = false;
    this.sshSessionData;
    this.hostConnected = false;
    this.clientIP = clientIP;
    this.logger = context.logger;
    this.bufferedHostMessages = []; //while awaiting certificate verification
    this.ws = websocket;
    if (messageConfig
      && messageConfig.hostTypeKey
      && messageConfig.hostDataKey
      && messageConfig.clientTypeKey
      && messageConfig.clientDataKey) {
      this.hostTypeKey = messageConfig.hostTypeKey;
      this.hostDataKey = messageConfig.hostDataKey;
      this.clientTypeKey = messageConfig.clientTypeKey;
      this.clientDataKey = messageConfig.clientDataKey;

      websocket.on('message', (msg: any) => { this.handleWebsocketMessage(msg); });
      this.configured = true;
    }
    else {
      this.logger.warn('ZWED0130W', ""); //this.logger.warn('Terminal websocket proxy was not supplied with valid message config description');
      this.closeConnection(websocket, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR, 'termproxy config invalid');
    }
  }

  identifierString() {
    if (!this.host && !this.port) {
      return String('[New Connection, ClientIP=' + this.clientIP + ']');
    }
    return String('[Host=' + this.host + ', Port=' + this.port + ', ClientIP=' + this.clientIP + ']');
  }

  handleWebsocketMessage(msg: string) {
    if (this.configured !== true && this.ws.readyState < 2) { //if ws is still open
      this.closeConnection(this.ws, WEBSOCKET_REASON_TERMPROXY_GOING_AWAY, 'WS open when expected to be closed');
      return;
    }
    this.handleTerminalClientMessage(msg, this.ws);
  }

  decrementCounters() {
    openTerminalConnections--;
    this.logger.info('ZWED0097I', this.identifierString() + ' ' + String(openTerminalConnections)); //this.logger.info(this.identifierString()+' Websocket closed. Total remaining terminals connected: '+openTerminalConnections);
    if (this.hostTypeKey == '3270_HOST_MESSAGE') {
      openTerminalConnections3270--;
      this.logger.info('ZWED0098I', String(openTerminalConnections3270)); //this.logger.info('Total TN3270 terminals connected: '+openTerminalConnections3270);
    }
    else if (this.hostTypeKey == '5250_HOST_MESSAGE') {
      openTerminalConnections5250--;
      this.logger.info('ZWED0099I', String(openTerminalConnections5250)); //this.logger.info('Total TN5250 terminals connected: '+openTerminalConnections5250);
    }
    else if (this.hostTypeKey == 'TELNET_DATA') {
      openTerminalConnectionsVT--;
      this.logger.info('ZWED0100I', String(openTerminalConnectionsVT)); //this.logger.info('Total VT terminals connected: '+openTerminalConnectionsVT);
    }
  }

  closeConnection(ws: any, code: number, message: string) {
    if (this.hostConnected) {
      this.decrementCounters();
      this.hostConnected = false;
    }
    if (this.hostSocket) {
      try {
        this.hostSocket.destroy();
      } catch (e) {
        this.logger.warn("ZWED0131W", this.identifierString() + ' ' + e.message); //this.logger.warn(this.identifierString()+' Error when destroying host socket. e='+e.message);
      }
    }
    if (ws.readyState < 2) {//if still open
      ws.close(code, message.substring(0, WS_CLOSE_MESSAGE_LENGTH_LIMIT));//web limited to length=123
    }
  }

  handleWebsocketClosed(code: number, reason: number) {
    if (this.hostSocket) {
      if (this.hostConnected) {
        this.decrementCounters();
      }
      try {
        this.hostSocket.destroy();//kill the host socket too
      } catch (e: unknown) {
        this.logger.warn("ZWED0132W", this.identifierString() + ' ' + (e as Error).message); //this.logger.warn(this.identifierString()+' Error when destroying host socket. e='+e.message);
      }
    }
    this.hostConnected = false;
  }

  handleTerminalClientMessage(message: string, websocket: any) {
    let jsonObject;
    try {
      jsonObject = JSON.parse(message);
    } catch (e) {
      //not json
      this.logger.warn("ZWED0133W", this.identifierString()); //this.logger.warn(this.identifierString()+' sent messsage which was not JSON');
      this.closeConnection(websocket, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR, 'Message not JSON');
    }
    this.logger.trace("ZWED0269I", this.identifierString(), String(message.length)); //this.logger.debug(this.identifierString()+' Websocket client message received. Length='+message.length);
    this.logger.trace("ZWED0135I", this.identifierString(), message); //this.logger.log(this.logger.FINER,this.identifierString()+' Websocket client message content='+message);
    if (jsonObject) {
      if (this.handlers) {
        const handlerlen = this.handlers.length;
        for (let i = 0; i < handlerlen; i++) {
          try {
            const result = this.handlers[i].handleClientMessage(jsonObject, this);
            if (result && result.response) {
              this.wsSend(websocket, JSON.stringify(result.response));
              if (!result.continue) {
                return;
              }
            }
          } catch (e) {
            this.logger.warn('ZWED0134W', i + ' ' + e.stack); //this.logger.warn('Terminal handler # '+i+' threw exception on handle client message. E='+e.stack);
          }
        }
      }
      if (this.hostConnected === false) {
        if (jsonObject.t === 'CONFIG') {
          this.logger.info('NOID', "JOE sees config from client " + JSON.stringify(jsonObject));
          this.connect(jsonObject.host, jsonObject.port, websocket, jsonObject.security);
        }
      }
      else {
        if (jsonObject.t === 'CERT_RES') {
          if (this.awaitingCertificateVerification) {
            if (jsonObject.fp === this.outstandingCertFingerprint) {
              if (jsonObject.a === true) {//accepted
                this.logger.debug("ZWED0270I", this.identifierString() + ' ' + this.bufferedHostMessages.length); //this.logger.debug(this.identifierString()+' Certificate accepted by client, processing buffered host data messages. Messages to process='+this.bufferedHostMessages.length);

                let hostMessage;
                while (this.bufferedHostMessages.length > 0) {
                  hostMessage = this.bufferedHostMessages.pop();
                  this.handleData(hostMessage, websocket);
                }
                this.awaitingCertificateVerification = false;
              }
              else {//rejected
                for (let i = 0; i < this.bufferedHostMessages.length; i++) {
                  delete this.bufferedHostMessages[i];
                }
                this.bufferedHostMessages = [];
                const errorMessage = {
                  text: this.identifierString() + ' Certificate rejection recieved.',
                  t: 'CERT_REJECT'
                };
                this.logger.debug("ZWED0271I", errorMessage.text); //this.logger.debug(errorMessage.text);
              }
            } else {
              this.logger.warn("ZWED0135W", this.identifierString()); //this.logger.warn(this.identifierString()+' CERT_RES seen but fingerprint does not match outstanding certificate request.');
            }
          } else {
            this.logger.debug("ZWED0272I", this.identifierString()); //this.logger.debug(this.identifierString()+' CERT_RES seen but not awaiting any certificate verification.');
          }
        }
        else if (jsonObject.t === this.clientTypeKey) {
          const data = base64ToUint8Array(jsonObject[this.clientDataKey]);
          const dataBuffer = Buffer.from(data);
          if (this.usingSSH && this.sshSessionData) {
            const sshData = { 'msgCode': SSH_MESSAGE.SSH_MSG_CHANNEL_DATA, 'data': dataBuffer };
            ssh.sendSSHData(this, sshData);
          }
          else {
            this.netSend(dataBuffer);
          }
        }
        else if (jsonObject.t === 'SSH_USER_AUTH_RES') {
          if (this.usingSSH && this.sshSessionData) {
            switch (jsonObject.m) {
              case 'publickey':
                if (jsonObject.alg && jsonObject.d && jsonObject.qo) {//this part is just for querying if the pubkey will be supported
                  const credential = {
                    'msgCode': SSH_MESSAGE.SSH_MSG_USERAUTH_REQUEST,
                    'method': jsonObject.m,
                    'queryOnly': jsonObject.qo,
                    'algorithm': jsonObject.alg,
                    'blob': jsonObject.data
                  };
                  ssh.sendSSHData(this, credential);
                }
                else if (jsonObject.alg && jsonObject.k && jsonObject.s) {
                  const credential = {
                    'msgCode': SSH_MESSAGE.SSH_MSG_USERAUTH_REQUEST,
                    'method': jsonObject.m,
                    'algorithm': jsonObject.alg,
                    'key': jsonObject.k,
                    'signature': jsonObject.s
                  };
                  ssh.sendSSHData(this, credential);
                }
                else {
                  this.logger.warn('ZWED0136W', 'Malformed SSH_USER_AUTH_RES for publickey. Missing alg, and k,s or d,qo'); //this.logger.warn('Malformed SSH_USER_AUTH_RES for publickey.Missing alg, and k, s or d, qo');
                }
                break;
              case 'password': {
                const credential = {
                  'msgCode': SSH_MESSAGE.SSH_MSG_USERAUTH_REQUEST,
                  'method': jsonObject.m,
                  'username': jsonObject.u,
                  'password': jsonObject.p
                };
                ssh.sendSSHData(this, credential);
                break;
              }
              case 'hostbased':
                break;

            }
          } else {
            this.logger.debug('ZWED0273I', 'SSH_USER_AUTH type seen while not setup for SSH.'); //this.logger.debug('SSH_USER_AUTH type seen while not setup for SSH.');
            //TODO send error msg to client
          }
        }
        else if (jsonObject.t === 'SSH_USER_AUTH_INFO_RES') {
          if (this.usingSSH && this.sshSessionData) {
            ssh.sendSSHData(this, {
              msgCode: SSH_MESSAGE.SSH_MSG_USERAUTH_INFO_RESPONSE,
              responses: jsonObject.res
            });
          }
        }
        else if (jsonObject.t === 'SSH_CH_REQ') {
          if (this.usingSSH && this.sshSessionData) {
            ssh.sendSSHData(this, {
              msgCode: SSH_MESSAGE.SSH_MSG_CHANNEL_REQUEST,
              channel: (jsonObject.ch ? jsonObject.ch : null),
              type: jsonObject.reqt,
              reply: jsonObject.reply,
              requestContents: jsonObject.data
            });
          }
          else {
            this.logger.debug('ZWED0274I', 'Ignoring SSH_CH_REQ when SSH not in use or not ready'); //this.logger.debug('Ignoring SSH_CH_REQ when SSH not in use or not ready');
          }
        }
        else if (jsonObject.t === 'IP_REQ') {
          /*This ability is for allowing the client to know what its IP is so that it can 
            tell terminal servers what its true IP is.*/
          this.wsSend(websocket, JSON.stringify({
            "t": "IP_RES",
            "data": this.clientIP
          }));
        }
      }
    }
  }

  netSend(buffer: Buffer) {
    this.logger.trace("ZWED0275I", this.identifierString(), String(buffer.length)); //this.logger.debug(this.identifierString()+' Writing to host socket. Length='+buffer.length);
    this.logger.trace("ZWED0136I", this.identifierString(), buffer.toString('utf-8')); //this.logger.log(this.logger.FINER,this.identifierString()+' Content to be sent to host socket=\n'+buffer);
    this.hostSocket.write(buffer);
  }

  wsSend(websocket: any, string: string) {
    this.logger.trace("ZWED0276I", this.identifierString(), String(string.length)); //this.logger.debug(this.identifierString()+' Websocket sending client message. Length='+string.length);
    this.logger.trace("ZWED0137I", this.identifierString(), string); //this.logger.log(this.identifierString()+' Content to be sent to client=\n'+string);
    websocket.send(string);
  };

  // handle data from the host
  handleData(data: Buffer, ws: any) {
    const t = this;
    try {
      t.logger.trace("ZWED0277I", t.identifierString(), String(data.length)); //t.logger.debug(t.identifierString()+' Received host data. Length='+data.length);
      t.logger.trace("ZWED0138I", t.identifierString(), data.toString('utf-8')); //t.logger.log(t.logger.FINER,t.identifierString()+' Content of host data=\n'+data);

      const replies = [];
      if (t.usingSSH) {
        const sshMessages = ssh.processEncryptedData(t, data);
        if (sshMessages.length > 0) {
          sshMessages.forEach(function (sshMessage: any) {
            switch (sshMessage.type) {
              case SSH_MESSAGE.SSH_MSG_USERAUTH_INFO_REQUEST:
                sshMessage.t = 'SSH_USER_AUTH_INFO_REQ';
                replies.push(sshMessage);
                break;
              case SSH_MESSAGE.SSH_MSG_USERAUTH_PK_OK:
                replies.push({ t: 'SSH_USER_AUTH_PK_OK' });
                break;
              case SSH_MESSAGE.SSH_MSG_USERAUTH_BANNER:
              case SSH_MESSAGE.SSH_MSG_CHANNEL_DATA: {
                const b64Data = utf8ArrayToB64(Buffer.from(
                  (sshMessage.type === SSH_MESSAGE.SSH_MSG_CHANNEL_DATA)
                    ? sshMessage.readData
                    : sshMessage.message, 'utf8'));
                const reply: any = { t: t.hostTypeKey };
                reply[t.hostDataKey] = b64Data;
                replies.push(reply);
              }
                break;
              case SSH_MESSAGE.SSH_MSG_SERVICE_ACCEPT:
                replies.push({
                  t: "SSH_USER_AUTH_REQ"
                });
                break;
              case SSH_MESSAGE.SSH_MSG_DISCONNECT:
                const errorMessage = 'SSH session disconnected';
                t.logger.warn("ZWED0137W", t.identifierString() + ' ' + errorMessage); //t.logger.warn(t.identifierString()+' '+errorMessage);
                t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_GOING_AWAY, errorMessage);
                break;
              case SSH_MESSAGE.SSH_MSG_CHANNEL_REQUEST:
                const b64Data = utf8ArrayToB64(Buffer.from(sshMessage.data, 'utf8'));
                replies.push({
                  "t": "SSH_CH_REQ",
                  "ch": sshMessage.recipientChannel,
                  "reqt": sshMessage.requestName,
                  "reply": sshMessage.needsReply,
                  "B64": b64Data
                });
                break;
              case SSH_MESSAGE.SSH_MSG_USERAUTH_FAILURE:
                t.logger.debug('ZWED0278I', 'Probably user or password was wrong.'); //t.logger.debug('Probably user or password was wrong.');
                replies.push({
                  t: "SSH_USER_AUTH_REQ"
                });
                break;
              case SSH_MESSAGE.ERROR: {
                const errorMessage = 'SSH encountered error=' + sshMessage.msg;
                t.logger.warn("ZWED0138W", t.identifierString() + ' ' + errorMessage); //t.logger.warn(t.identifierString()+' '+errorMessage);
                t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR, errorMessage);
                break;
              }
              default:
              //ignore
            }
          });
        }
      } else {
        const b64Data = utf8ArrayToB64(data);
        const reply: any = { t: t.hostTypeKey };
        reply[t.hostDataKey] = b64Data;
        replies.push(reply);
      }
      if (replies.length > 0) {
        replies.forEach(function (reply) {
          const stringReply = JSON.stringify(reply);
          t.wsSend(ws, stringReply);
        });
      }
    } catch (e) {
      const errorMessage = 'Host communication error=' + e.message;
      t.logger.warn("ZWED0139W", e.message); //t.logger.warn(errorMessage);
      t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR, errorMessage);
    }
  }

  connect(host: string, port: number, ws: any, security: any) {
    const t = this;
    let connectOptions: any = null;
    t.websocket = ws;

    console.log("JOE CONNECT ckpt.0");

    const promptOrAcceptCertificate = function (servername: string, certificate: any): any {
      t.logger.debug('ZWED0279I', servername + ' ' + certificate); //t.logger.debug('Creating server fingerprint. server='+servername+', certificate='+certificate);
      let fingerprintHash = crypto.createHash('sha256');
      fingerprintHash.update(certificate.raw);
      let hex = fingerprintHash.digest('hex');
      let fingerprint = '';
      for (let i = 0; i < hex.length - 1;) {
        fingerprint += hex.substring(i, i + 2) + ':';
        i = i + 2;
      }
      fingerprint = fingerprint.substring(0, fingerprint.length - 1);
      t.logger.debug("ZWED0280I", t.identifierString() + ' ' + fingerprint); //t.logger.debug(t.identifierString()+' Checking if certificate is OK. Fingerprint='+fingerprint);
      if (security.badCert != SECURITY_BAD_CERTIFICATE_ALLOW) {
        t.awaitingCertificateVerification = true;
        ws.send(JSON.stringify({
          t: 'CERT_PROMPT',
          fp: fingerprint,
          o: certificate
        }));
      }
      return undefined;
    };

    console.log("JOE CONNECT ckpt.1");

    if (host && port) {
      this.host = host;
      this.port = port;

      if (security && security.t === "ssh") {
        t.securitySettings = security;
        t.usingSSH = true;
      }
      else if (security && security.t === 'tls') {
        t.usingTLS = true;
        t.securitySettings = security;
        const rejectUnauthorized = ((typeof security.badCert == 'number') && security.badCert == SECURITY_BAD_CERTIFICATE_ALLOW) ? false : true;
        connectOptions = {
          rejectUnauthorized: rejectUnauthorized//True casues rejection of certs if the CA cannot handle them. For example, self-signed exceptions are thrown
        };
        /*
          With CAs, this will be called. It must return either undefined if allowed, or throw if not allowed, so it cannot be async. Instead we set up the server to buffer messages while the user is prompted if needed.
        */
        if (rejectUnauthorized) {
          connectOptions.checkServerIdentity = promptOrAcceptCertificate;
        }
        const securityObjects = TerminalWebsocketProxy.securityObjects;
        if (securityObjects) {
          if (securityObjects.ca) {
            connectOptions.ca = securityObjects.ca;
          }
          if (securityObjects.crl) {
            connectOptions.crl = securityObjects.crl;
          }
        }
      }
      if (!t.usingTLS) {
        this.hostSocket = net.Socket();
      }

      try {
        const errorHandler = function (e: any) {
          let errorMessage;
          if (e.code && e.code === 'ENOTFOUND') {
            errorMessage = "Error: Host not found";
          } else {
            errorMessage = 'Host communication error=' + e.message;
          }

          if (t.usingTLS) {
            const hostCert = t.hostSocket.getPeerCertificate();
            t.logger.debug('ZWED0281I', JSON.stringify(hostCert)); //t.logger.debug('The host had a certificate of: '+JSON.stringify(hostCert));
          }
          t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR, errorMessage);
          t.logger.warn("ZWED0140W", t.identifierString() + ' ' + errorMessage); //t.logger.warn(t.identifierString()+' '+errorMessage);
        };

        const connectHandler = function () {
          //TODO SSH also needs trusted hosts file. How can I get the SSH certificate?
          incrementCounters(t);

          t.hostSocket.on('error', errorHandler);

          t.hostSocket.on('data', function (data: Buffer) {
            if (t.awaitingCertificateVerification) {
              t.bufferedHostMessages.push(data);
              return;
            }
            t.handleData(data, ws);
          });

          t.hostSocket.on('close', function () {
            const errorMessage = 'Error: Host closed socket';
            t.logger.debug("ZWED0282I", t.identifierString() + ' ' + errorMessage); //t.logger.debug(t.identifierString()+' '+errorMessage);
            t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_GOING_AWAY, errorMessage);
          });

          //connect
          t.hostConnected = true;
        };
        try {
          if (t.usingTLS) {
            t.logger.debug('ZWED0283I', 'Attempting TLS connect'); //t.logger.debug('Attempting TLS connect');
            this.hostSocket = tls.connect(port, host, connectOptions, connectHandler);
            this.hostSocket.on('error', errorHandler);
          }
          else {
            t.logger.debug('ZWED0284I', 'Attempting SSH or telnet connect'); //t.logger.debug('Attempting SSH or telnet connect');
            this.hostSocket.on('error', errorHandler);
            this.hostSocket.connect(port, host, connectHandler);
          }
        } catch (e) {
          const errorMessage = 'Error durring connection=' + e.message;
          t.logger.warn("ZWED0141W", t.identifierString() + ' ' + errorMessage); //t.logger.warn(t.identifierString()+' '+errorMessage);
          t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR, errorMessage);
        }

      }
      catch (e) {
        let errorMessage: string;
        if (e.code && e.code === 'ENOTFOUND') {
          errorMessage = "Error: Host not found";
          t.logger.warn("ZWED0142W", e.errorMessage);
        } else {
          errorMessage = 'Host communication error=' + e.message;
          t.logger.warn("ZWED0143W", e.message);
        }
        //t.logger.warn(errorMessage);
        t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR, errorMessage);
      }

    }
  }
}

const incrementCounters = function (t:any) {
  openTerminalConnections++;
  t.logger.info('ZWED0101I', t.identifierString(), openTerminalConnections); //t.logger.info(t.identifierString()+' Connected. Total terminals connected: '+openTerminalConnections);
  if (t.hostTypeKey == '3270_HOST_MESSAGE') {
    openTerminalConnections3270++;
    t.logger.info('ZWED0102I', openTerminalConnections3270); //t.logger.info('Total TN3270 terminals connected: '+openTerminalConnections3270);
  }
  else if (t.hostTypeKey == '5250_HOST_MESSAGE') {
    openTerminalConnections5250++;
    t.logger.info('ZWED0103I', openTerminalConnections5250); //t.logger.info('Total TN5250 terminals connected: '+openTerminalConnections5250);
  }
  else if (t.hostTypeKey == 'TELNET_DATA') {
    openTerminalConnectionsVT++;
    t.logger.info('ZWED0104I', openTerminalConnectionsVT); //t.logger.info('Total VT terminals connected: '+openTerminalConnectionsVT);
  }
};


const tn3270MessageConfig = {
  hostTypeKey: '3270_HOST_MESSAGE',
  hostDataKey: 'B64',
  clientTypeKey: '3270_CLIENT_MESSAGE',
  clientDataKey: 'data'
}

const tn5250MessageConfig = {
  hostTypeKey: '5250_HOST_MESSAGE',
  hostDataKey: 'B64',
  clientTypeKey: '5250_CLIENT_MESSAGE',
  clientDataKey: 'data'
}

const vtMessageConfig = {
  hostTypeKey: 'TELNET_DATA',
  hostDataKey: 'B64',
  clientTypeKey: 'VT_INPUT',
  clientDataKey: 'data'
};

let openTerminalConnections = 0;
let openTerminalConnectionsVT = 0;
let openTerminalConnections3270 = 0;
let openTerminalConnections5250 = 0;

function createSecurityObjects(httpsConfig: any, logger: DumbLogger) {
  const readFilesToArray = function (fileList: string[]) {
    const contentArray: any[] = [];
    fileList.forEach(function (filePath) {
      try {
        contentArray.push(fs.readFileSync(filePath));
      } catch (e: any) {
        logger.warn('ZWED0144W', filePath + ' ' + e.message); //logger.warn('Error when reading file='+filePath+'. Error='+e.message);
      }
    });
    if (contentArray.length > 0) {
      return contentArray;
    }
    else {
      return null;
    }
  };
  TerminalWebsocketProxy.securityObjects = {};
  if (httpsConfig.certificateAuthorities) {
    logger.debug('ZWED0285I', 'I see and will read in the CAs'); //logger.debug('I see and will read in the CAs');
    TerminalWebsocketProxy.securityObjects.ca = readFilesToArray(httpsConfig.certificateAuthorities);
  }
  if (httpsConfig.certificateRevocationLists) {
    TerminalWebsocketProxy.securityObjects.crl = readFilesToArray(httpsConfig.certificateRevocationLists);
  }
}

let handlerModules: any = null;
const scanAndImportHandlers = function (logger: DumbLogger) {
  if (handlerModules == null) {
    handlerModules = [];
    const handlers: {[filename: string]: string} = {}; //key: filename, value: path

    let filenames;
    let len;
    try {
      const handlerDir = pathModule.join(process.env.INSTANCE_DIR, 'workspace', 'app-server', 'org.zowe.terminal.proxy', 'handlers');
      filenames = fs.readdirSync(handlerDir);
      len = filenames.length;
      for (let i = 0; i < len; i++) {
        const filename = filenames[i];
        if (filename.endsWith('.js')) {
          handlers[filename] = pathModule.join(handlerDir, filename);
        }
      }
    } catch (e) {
      //folder does not exist, skip
    }

    filenames = fs.readdirSync(__dirname);
    len = filenames.length;
    for (let i = 0; i < len; i++) {
      let filename = filenames[i];
      if (filename.endsWith('.js') &&
        (filename != 'terminalProxy.js') &&
        (filename != 'serve1.js') && // this is not exactly a paragon of abstraction
        (filename != 'ssh.js')) {
        if (!handlers[filename]) {
          handlers[filename] = pathModule.resolve(pathModule.join(__dirname, filename));
        }

      }
    }


    const paths: string[] = Object.values(handlers);
    for (let i = 0; i < paths.length; i++) {
      try {
        const module = require(paths[i]);
        if (typeof module.handleClientMessage == 'function') {
          logger.info('ZWED0105I', paths[i]); //logger.info('Found and loaded compatible handler file filename);
          handlerModules.push(module);
        }
      } catch (e) {
        logger.warn('ZWED0145W', paths[i]); //logger.warn('Could not load a handler from file filename);
      }

    }
  }
  return handlerModules;
}

export const tn3270WebsocketRouter = function (context: any) {
  context.logger.info("ZWED0113I", "JOE TSPROXY " + JSON.stringify(context));
  /* 
     a handler is an external component for interpreting messages of types or in ways not covered in this code alone
     a handler is given the data and returns  a JSON response which includes whether to continue or not
     requires: wsmessage, this
     returns: {response: {}, continue: true/false}
     if malformed, continues.
     
     handlers can come from /lib for now.
  */
  const handlers = scanAndImportHandlers(context.logger);
  return new Promise(function (resolve, reject) {
    const securityConfig = context.plugin.server.config.user.node.https;
    if (securityConfig && !TerminalWebsocketProxy.securityObjects) {
      createSecurityObjects(securityConfig, context.logger);
    }

    const router = express.Router();
    /* This was a hack for when the router.ws object, which should exist, did not exist.
       We put the function that creates it into the context object. Hopefully it is not needed anymore
       But in case it is, this code is commented out for future use
       
       if (!router.ws) {
       context.wsRouterPatcher(router);
       }
    */
    router.use(function abc(req, res, next) {
      context.logger.info('ZWED0106I', req.method); //context.logger.info('Saw Websocket request, method='+req.method);      
      next();
    });
    console.log("JOE: router=" + router);

    (router as any).ws('/', function (ws: any, req: any) {
      new TerminalWebsocketProxy(tn3270MessageConfig, req.ip, context, ws, handlers);
      //this is a new connection, this must make a BRAND NEW INSTANCE!!!
    });
    console.log("JOE after router.ws()");
    resolve(router);
  });
}

exports.tn5250WebsocketRouter = function (context: any) {
  const handlers = scanAndImportHandlers(context.logger);
  return new Promise(function (resolve, reject) {
    const securityConfig = context.plugin.server.config.user.node.https;
    if (securityConfig && !TerminalWebsocketProxy.securityObjects) {
      createSecurityObjects(securityConfig, context.logger);
    }

    const router = express.Router();
    /*
      if (!router.ws) {
      context.wsRouterPatcher(router);
      }
    */
    router.use(function abc(req, res, next) {
      context.logger.info('ZWED0107I', req.method); //context.logger.info('Saw Websocket request, method='+req.method);
      next();
    });
    (router as any).ws('/', function (ws: any, req: any) {
      new TerminalWebsocketProxy(tn5250MessageConfig, req.ip, context, ws, handlers);
      //this is a new connection, this must make a BRAND NEW INSTANCE!!!
    });
    resolve(router);
  });
}

exports.vtWebsocketRouter = function (context: any) {
  const handlers = scanAndImportHandlers(context.logger);
  ssh.setLogger(context.logger);
  return new Promise(function (resolve, reject) {
    const securityConfig = context.plugin.server.config.user.node.https;
    if (securityConfig && !TerminalWebsocketProxy.securityObjects) {
      createSecurityObjects(securityConfig, context.logger);
    }

    const router = express.Router();
    /*
      if (!router.ws) {
      context.wsRouterPatcher(router);
      }
    */
    router.use(function abc(req: any, res: any, next: any) {
      context.logger.info('ZWED0108I', req.method); //context.logger.info('Saw Websocket request, method='+req.method);
      next();
    });
    (router as any).ws('/', function (ws:any, req: any) {
      new TerminalWebsocketProxy(vtMessageConfig, req.ip, context, ws, handlers);
      //this is a new connection, this must make a BRAND NEW INSTANCE!!!
    });
    resolve(router);
  });
}

export const makeDumbLogger = function () {
  return new DumbLogger();
}

/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/

