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
let chats = [];
let metrics = {};
metrics.sim = 0,
  metrics.nao = 0,
  metrics.indeciso = 0,
  metrics['nao quis responder'] = 0;

update(500000);
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
  console.log("MUDOU", data)
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

avisos.on('novo', function(data) {
  console.log("NOVO", data)
  let opt = {
    parse_mode: 'html'
  };
  let text = `
  O deputado <a href="${data.foto}">${data.nome}(${data.partido} - ${data.uf})</a> acaba incluir seu voto.
  Voto: ${capitalizeFirstLetter(data.impeachment)}
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
  ✅ A favor: ${metrics.sim}
  ❌ Contra: ${metrics.nao}
  ❓ Indecisos: ${metrics.indeciso}
  ❕ Não quiseram responder: ${metrics['nao quis responder']}
`;
  chatsManager(msg.chat.id);
  bot.sendMessage(msg.chat.id, text, opt);
  botan.track(msg, 'placar');
});

bot.onText(/\/lista/, function(msg, match) {
  let opt = {
    parse_mode: 'html'
  };
  for (let j = 0; j < deputadosList.length; j += 70) {
    let text = `
  <b>Placar do Impeachment</b> <i>v0.0.1</i>
  `;
    let newDeps = deputadosList.slice(j, j + 70);
    for (let i in newDeps) {
      text += `🔹 ${newDeps[i].nome}(${newDeps[i].partido} - ${newDeps[i].uf}) - ${newDeps[i].impeachment}
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
          metrics.sim = 0;
          metrics.nao = 0;
          metrics.indeciso = 0;
          metrics['nao quis responder'] = 0;
          for (let i in parsedContent) {
            deputadosList.push(new Deputado(parsedContent[i].gsx$nome.$t, parsedContent[i].gsx$partido.$t, parsedContent[i].gsx$uf.$t, parsedContent[i].gsx$impeachment.$t, parsedContent[i].gsx$mudou.$t, parsedContent[i].gsx$foto.$t));
            metrics[parsedContent[i].gsx$impeachment.$t]++;
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
            } else {
              let novoDeputado = new Deputado(parsedContent[i].gsx$nome.$t, parsedContent[i].gsx$partido.$t, parsedContent[i].gsx$uf.$t, parsedContent[i].gsx$impeachment.$t, parsedContent[i].gsx$mudou.$t, parsedContent[i].gsx$foto.$t);
              deputadosList.push(novoDeputado);
              avisos.emit("novo", novoDeputado);
            }
          }
        }
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
