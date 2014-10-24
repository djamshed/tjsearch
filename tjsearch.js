// Set up a collection to contain words information.
Words = new Mongo.Collection("words");

if (Meteor.isClient) {
  // creates links using translate service results
  function createLinks() {
    // resets session vars (templates will react)
    ['en', 'ru', 'tj', 'err'].forEach(function(lang) {
      Session.set(lang, '');
    });

    // input text value
    var val = document.getElementById('tj_txt').value;

    // TODO: get rid of a single word limitation
    // pick the first word
    var tjWord = val.split(' ')[0];
    // min length is 2 chars
    if (tjWord.length < 2) return;
    // show loading
    Session.set('loading', 1);
    // call translate on the server
    Meteor.call('translate', val, function(err, result) {
      if (err || !result)
        Session.set('err', 1);
      else if (result) {
        if (result.en) Session.set('en', result.en);
        if (result.ru) Session.set('ru', result.ru);
        if (result.tj) Session.set('tj', result.tj);
        if (!result.en & !result.ru) Session.set('err', 1);
      }
      // remove loading msg
      Session.set('loading', 0);
    });
  }

  // search box events
  Template.searchbox.events({
    'click .js-search-btn': function() {
      createLinks();
    },
    'keypress #tj_txt': function(e) {
      // ENTER key should be treated similar to the "search" button click
      if (e.keyCode == 13) {
        createLinks();
      }
    },
    'click .example': function(e) {
      document.getElementById('tj_txt').value = e.currentTarget.innerHTML;
    }
  });

  Template.searchEngines.helpers({
    en: function() {
      return Session.get("en");
    },
    tj: function() {
      return Session.get("tj");
    },
    ru: function() {
      return Session.get("ru");
    },
    err: function() {
      return Session.get("err");
    },
    loading: function() {
      return Session.get("loading");
    }
  });
}

// On server startup, create some players if the database is empty.
if (Meteor.isServer) {

  // function makes a call to the translate server (lugat.tj)
  // to find equivalent of tjWord in english and russian
  // returns back an object with translated equivalents for each language
  // eg. {ru: 'привет', en: 'hello', tj: 'салом'}
  function askTranslateServer(tjWord) {
    var TRANSLATE_URL = 'http://lugat.tj/ajax/ajaxsearch.php?word=';
    try {
      var result = HTTP.get(TRANSLATE_URL + tjWord),
        xmlStr = result.content,
        tags = ['<word>', '</word>'];

      // find start/end of <word>s
      var startIdx = xmlStr.indexOf(tags[0]),
        endIdx = xmlStr.lastIndexOf(tags[1]) + tags[1].length,
        wordsXML = '';

      if (startIdx > -1) {
        wordsXML = xmlStr.substring(xmlStr.indexOf(tags[0]), xmlStr.lastIndexOf(tags[1]) + tags[1].length);
      }
      //wrap wordsXML with '<words> tags so parser parses it as an array
      // convert xml string to JS object
      var obj = xml2js.parseStringSync('<words>' + wordsXML + '</words>');

      var en = '', // tjWord's en equivalent
        ru = '', // tjWord's ru equivalent
        // length of translation pair guesses
        len = (obj.words.word && obj.words.word.length) || 0;
      // obj.words.word is an array of tj to en and tj to ru "guesses"
      // we need to have exact match between tjru2 and tjWord for ru translation
      // we also need to have exact match between tjen2 and tjWord for en translation
      for (var i = 0; i < len; i++) {
        var w = obj.words.word[i];
        // check english translation
        if (w.tjen2 && w.tjen2[0] === tjWord) {
          longEn = (w.entj2 && w.entj2[0]) || '';
          // pick only the first valid word
          var match = longEn.match(/[a-zA-Z]+/);
          en = (match && match.length && match[0]) || '';
        }
        // check english translation
        else if (w.tjru2 && w.tjru2[0] === tjWord) {
          longRu = (w.rutj2 && w.rutj2[0]) || '';
          // pick only the first valid word in cyrillic
          var match = longRu.match(/[а-яА-ЯёЁ]+/);
          ru = (match && match.length && match[0]) || '';
        }
        // terminate loop if both en and ru found
        if (en && ru)
          i = len;
      }

      var translation = {
        tj: tjWord,
        en: en,
        ru: ru,
        timesUsed: 1
      };

      //cache result
      Words.insert(translation);
      return translation;
    } catch (e) {
      console.log('error', e);
    }
  }

  Meteor.startup(function() {
    Words.remove({});

    Meteor.methods({
      translate: function(tjWord) {
        // nothing to translate
        if (!tjWord) return undefined;

        // check if we have translated it before
        var cached = Words.findOne({
          tj: tjWord
        });

        if (cached) {
          // increment usage counter
          Words.update(cached, {
            $inc: {
              timesUsed: 1
            }
          });
          return cached;
        } else
          return askTranslateServer(tjWord);

      }
    });

  });
}
