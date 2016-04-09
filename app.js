'use strict';

let events = require('events');
let avisos = new events.EventEmitter();

let botan = require('botanio')(process.argv[2]);

let jsonfile = require('jsonfile');

let _ = require('lodash');

let rp = require('request-promise');

let TelegramBot = require('node-telegram-bot-api');
const token = process.argv[3];
let bot = new TelegramBot(token, {
  polling: true
});

const jsonEndpoint = `https://spreadsheets.google.com/feeds/list/1fe3WOY4Zkx6M7aQ-LdklI_3Tlzbf1KkZSKQDqESAKrE/od6/public/values?alt=json`;
let parsedContent = {};
let deputadosList = [];
let partidosList = [];
let chats = [];
let metrics = {};
metrics.aFavor = 0,
  metrics.contra = 0,
  metrics.indecisos = 0,
  metrics.naoQuisResponder = 0;

update();
chatsManager();
setInterval(update, 5000);

const startMessage = `
  <b>Placar do Impeachment</b> <i>v0.0.1</i>
  Com esse bot você poderá acompanhar o posicionamento dos deputados quanto ao impeachment da presidente <i>Dilma Roussef</i>.
  Desenvolvido por Lucas Vasconcelos (@vasconcelos) com dados coletados da página do <a href="http://infograficos.estadao.com.br/politica/placar-do-impeachment/">Estadão</a>.
`;

class Deputado {
  constructor(nome, partido, uf, impeachment, mudou, foto) {
    this.nome = nome;
    this.partido = partido;
    this.uf = uf;
    this.impeachment = impeachment;
    this.mudou = (mudou === "sim") ? true : false;
    this.foto = `http://infograficos.estadao.com.br/politica/placar-do-impeachment/img/fotos/${foto}`;
    avisos.emit('adicionado', this);
  }
  alterar(impeachment, mudou) {
    this.votoAnterior = this.impeachment;
    this.mudou = mudou;
    this.impeachment = impeachment;
    avisos.emit('mudou', this);
  }
}

avisos.on('mudou', function(data) {
  let opt = {
    parse_mode: 'html'
  };
  let text = `
  O deputado <a href="${data.foto}">${data.nome}(${data.partido} - ${data.uf})</a> acaba de mudar seu voto.
  Voto: ${capitalizeFirstLetter(data.impeachment)}
  Voto anterior: ${capitalizeFirstLetter(data.votoAnterior)}
  `;
  for (let i in chats) {
    let obj = chats[i][Object.keys(chats[i])[0]];
    if (obj.notificacao == true)
      bot.sendMessage(Object.keys(chats[i])[0], text, opt);
  }
});

bot.onText(/\/start/, function(msg, match) {
  let opt = {
    parse_mode: 'html'
  };
  chatsManager(msg.chat.id);
  bot.sendMessage(msg.chat.id, startMessage, opt);
  botan.track(msg, 'start');
});

bot.onText(/\/placar/, function(msg, match) {
  let opt = {
    parse_mode: 'html'
  };
  let text = `
  <b>Placar do Impeachment</b> <i>v0.0.1</i>
  ✅ A favor: ${metrics.aFavor}
  ❌ Contra: ${metrics.contra}
  ❓ Indecisos: ${metrics.indecisos}
  ❕ Não quiseram responder: ${metrics.naoQuisResponder}
`;
  chatsManager(msg.chat.id);
  bot.sendMessage(msg.chat.id, text, opt);
  botan.track(msg, 'placar');
});

bot.onText(/\/partidos/, function(msg, match) {
  let text = 'Escolha o partido'
  let opt = {
    reply_to_message_id: msg.message_id,
    reply_markup: JSON.stringify({
      keyboard: partidosList,
      one_time_keyboard: true,
      selective: true,
      hide_keyboard: true
    })
  }
  bot.sendMessage(msg.chat.id, text, opt);
  chatsManager(msg.chat.id);
  botan.track(msg, 'lista');
});

bot.onText(/(.+)/, function(msg, match) {
  let opt = {
    parse_mode: 'html'
  };
  let deputados = _.filter(deputadosList, function(o) {
    return o.partido === match[1];
  });
  if (deputados) {
    let text = `
      <b>Placar do Impeachment</b> <i>v0.0.1</i>
    `;
    for (let i in deputados) {
      let emoji;
      switch (deputados[i].impeachment) {
        case 'sim':
          emoji = '\u2705';
          break;
        case 'nao':
          emoji = '\u274C';
          break;
        case 'indeciso':
          emoji = '\u2753';
          break;
        case 'nao quis responder':
          emoji = '\u2755';
          break;
      }
      text += `${emoji} ${deputados[i].nome}<i>(${deputados[i].partido} - ${deputados[i].uf})</i>
    `;
    }
    bot.sendMessage(msg.chat.id, text, opt);
    chatsManager(msg.chat.id);
    botan.track(msg, 'lista');
  }
});

bot.onText(/\/lista/, function(msg, match) {
  let opt = {
    parse_mode: 'html'
  };
  let sendList = deputadosList;
  while (sendList.length !== 0) {
    let text = `
      <b>Placar do Impeachment</b> <i>v0.0.1</i>
    `;
    let tempList = sendList.splice(0, 70);
    for (let i in tempList) {
      let emoji;
      switch (tempList[i].impeachment) {
        case 'sim':
          emoji = '\u2705';
          break;
        case 'nao':
          emoji = '\u274C';
          break;
        case 'indeciso':
          emoji = '\u2753';
          break;
        case 'nao quis responder':
          emoji = '\u2755';
          break;
      }
      text += `${emoji} ${tempList[i].nome}<i>(${tempList[i].partido} - ${tempList[i].uf})</i>
    `;
    }
    bot.sendMessage(msg.chat.id, text, opt);
  }
  chatsManager(msg.chat.id);
  botan.track(msg, 'lista');
});

bot.onText(/\/notificar/, function(msg, match) {
  let opt = {
    parse_mode: 'html'
  };
  let text = "";
  for (let i in chats) {
    if (Object.keys(chats[i])[0] == msg.chat.id) {
      chats[i][Object.keys(chats[i])[0]].notificacao = !chats[i][Object.keys(chats[i])[0]].notificacao;
      if (chats[i][Object.keys(chats[i])[0]].notificacao) {
        text = "Notificações ativadas com sucesso.";
      } else {
        text = "As notificações foram desativadas.";
      }
    }
  }
  chatsManager(msg.chat.id);
  bot.sendMessage(msg.chat.id, text, opt);
});

function update(interval) {
  rp(jsonEndpoint)
    .then(function(body) {
      try {
        parsedContent = JSON.parse(body).feed.entry;
        if (deputadosList.length === 0) {
          metrics.aFavor = 0,
            metrics.contra = 0,
            metrics.indecisos = 0,
            metrics.naoQuisResponder = 0;
          for (let i in parsedContent) {
            deputadosList.push(new Deputado(parsedContent[i].gsx$nome.$t, parsedContent[i].gsx$partido.$t, parsedContent[i].gsx$uf.$t, parsedContent[i].gsx$impeachment.$t, parsedContent[i].gsx$mudou.$t, parsedContent[i].gsx$foto.$t));
            switch (parsedContent[i].gsx$impeachment.$t) {
              case 'sim':
                metrics.aFavor++;
                break;
              case 'nao':
                metrics.contra++;
                break;
              case 'indeciso':
                metrics.indecisos++;
                break;
              case 'nao quis responder':
                metrics.naoQuisResponder++;
                break;
            }
          }
        } else {
          for (let i in parsedContent) {
            let deputado = _.find(deputadosList, function(o) {
              return o.nome === parsedContent[i].gsx$nome.$t && o.uf === parsedContent[i].gsx$uf.$t && o.partido === parsedContent[i].gsx$partido.$t;
            });
            if (deputado) {
              if ((deputado.mudou != parsedContent[i].gsx$mudou.$t) && (deputado.impeachment != parsedContent[i].gsx$impeachment.$t)) {
                deputado.alterar(parsedContent[i].gsx$impeachment.$t, parsedContent[i].gsx$mudou.$t);
              }
            }
          }
        }
        let uniq = _.uniqBy(deputadosList, 'partido');
        uniq.map(((deputado) => partidosList.push([deputado.partido])));
      } catch (err) {
        console.log(`[ERROR][JSON PARSER]: ${err.message}`);
      }
    })
    .catch(function(err) {
      console.log(`[ERROR][REQUEST]: ${err.message}`);
    });
}

function chatsManager(id) {
  if (chats.length === 0) {
    jsonfile.readFile('./chats.json', function(err, obj) {
      chats = obj;
    });
  } else {
    let ids = [];
    for (let i in chats) {
      ids.push(parseInt(Object.keys(chats[i])[0]));
    }
    if (ids.indexOf(id) === -1) {
      chats.push({
        [id]: {
          notificacao: true
        }
      });
      jsonfile.writeFile('./chats.json', chats, function(err) {});
    }
  }
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
