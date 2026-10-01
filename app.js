const { copy } = window.DishaTranslations;
const { createOfflineGuide, isOfflineTopic, offlineDirectory } = window.DishaGuides;

const language = document.querySelector('#language');
const stateSelector = document.querySelector('#state');
const questionInput = document.querySelector('#question');
const answer = document.querySelector('#answer');
const microphone = document.querySelector('#mic');
const microphoneTitle = document.querySelector('#mic-title');
const microphoneHint = document.querySelector('#mic-hint');
const toast = document.querySelector('#toast');

let current = 'en';
let toastTimer;
let chatHistory = [];
let busy = false;

function t(key) {
  return (copy[current] || copy.hi)[key] || copy.en[key] || key;
}

function applyLanguage(code) {
  current = copy[code] ? code : 'en';
  document.documentElement.lang = current;
  document.documentElement.dir = ['ks', 'sd', 'ur'].includes(current) ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  document.querySelector('#mic-hint').textContent = t('micHint');
  document.querySelectorAll('.directory-topic').forEach((button, index) => {
    button.textContent = current === 'hi'
      ? directoryTopics[index].hi
      : directoryTopics[index].en;
  });

  questionInput.value = '';
  answer.hidden = true;
  chatHistory = [];
  checkReadiness();
}

language.addEventListener('change', (event) => applyLanguage(event.target.value));

function showOfflineStatus() {
  document.querySelector('#search-hint').textContent = t('offlineHint');
  document.querySelector('[data-i18n="privacy"]').textContent = t('offlinePrivacy');
  document.querySelector('#status-dot').classList.remove('needs-setup');
}

async function checkReadiness() {
  if (location.protocol === 'file:') {
    showOfflineStatus();
    return false;
  }

  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) throw new Error('offline');

    const health = await response.json();
    if (!health.ready) {
      showOfflineStatus();
      return false;
    }

    document.querySelector('#search-hint').textContent = t('searchHint');
    document.querySelector('[data-i18n="privacy"]').textContent = t('privacy');
    document.querySelector('#status-dot').classList.remove('needs-setup');
    return true;
  } catch {
    showOfflineStatus();
    return false;
  }
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3100);
}

function clearGuide() {
  document.querySelector('#answer-summary').textContent = '';
  document.querySelector('#follow-up').hidden = true;
  document.querySelector('#follow-up').textContent = '';
  document.querySelector('#scheme-list').replaceChildren();
  document.querySelector('#steps').replaceChildren();
  document.querySelector('#answer-note').textContent = '';
  document.querySelector('#source-list').replaceChildren();
  document.querySelector('#sources-wrap').hidden = true;
  document.querySelector('#official-link').hidden = true;
}

function renderGuide(guide) {
  document.querySelector('#answer-title').textContent = guide.intent_summary
    || 'Disha found a possible path';
  document.querySelector('#answer-summary').textContent = guide.reply || '';

  const followUp = document.querySelector('#follow-up');
  followUp.hidden = !guide.follow_up_question;
  followUp.textContent = guide.follow_up_question || '';

  const cards = document.querySelector('#scheme-list');
  cards.replaceChildren();
  for (const scheme of guide.schemes || []) {
    const card = document.createElement('article');
    card.className = 'scheme-card';

    const title = document.createElement('h3');
    title.textContent = scheme.name;
    card.append(title);

    const details = [
      scheme.fit_reason,
      scheme.benefit,
      scheme.eligibility_to_check,
      scheme.how_to_start,
    ];
    for (const value of details) {
      if (!value) continue;
      const row = document.createElement('p');
      row.className = 'scheme-detail';
      row.textContent = value;
      card.append(row);
    }

    const url = officialLink(scheme.official_url);
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'scheme-apply';
      link.textContent = scheme.name + ' ↗';
      card.append(link);
    }
    cards.append(card);
  }

  const steps = document.querySelector('#steps');
  const stepItems = (guide.next_steps || []).map((line) => {
    const item = document.createElement('li');
    item.textContent = line;
    return item;
  });
  steps.replaceChildren(...stepItems);
  document.querySelector('#answer-note').textContent = guide.safety_note || '';

  const sourceList = document.querySelector('#source-list');
  const sources = (guide.sources || [])
    .map((item) => ({ ...item, url: officialLink(item.url) }))
    .filter((item) => item.url);
  const sourceLinks = sources.map((source) => {
    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = source.title || 'Official government source ↗';
    return link;
  });
  sourceList.replaceChildren(...sourceLinks);
  document.querySelector('#sources-wrap').hidden = !sources.length;

  const fallbackLink = document.querySelector('#official-link');
  fallbackLink.hidden = Boolean((guide.schemes || []).length || guide.follow_up_question);
  fallbackLink.href = 'https://www.myscheme.gov.in/';
  document.querySelector('#link-label').textContent = t('linkScheme');
}

function officialLink(value) {
  try {
    const url = new URL(value);
    const isGovernmentHost = /(^|\.)gov\.in$|(^|\.)nic\.in$/i.test(url.hostname);
    return url.protocol === 'https:' && isGovernmentHost ? url.href : null;
  } catch {
    return null;
  }
}

async function askDisha(text) {
  if (busy) return;

  const message = text.trim();
  if (!message) {
    notify(t('placeholderResponse'));
    questionInput.focus();
    return;
  }

  busy = true;
  document.querySelector('#send-button').disabled = true;
  questionInput.disabled = true;
  answer.hidden = false;
  clearGuide();
  document.querySelector('#ai-loading').hidden = false;
  document.querySelector('#answer-title').textContent = '';
  answer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    if (location.protocol === 'file:' || isOfflineTopic(message)) {
      showOfflineGuide(message);
      return;
    }

    const healthResponse = await fetch('/api/health', { cache: 'no-store' });
    if (!healthResponse.ok) {
      showOfflineGuide(message);
      return;
    }

    const health = await healthResponse.json();
    if (!health.ready) {
      showOfflineGuide(message);
      return;
    }

    const response = await fetch('/api/guide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message,
        language: current,
        state: stateSelector.value.replace(' — தமிழ்நாடு', ''),
        history: chatHistory.slice(-6),
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      const note = (data.error || 'The live AI answer could not be reached.')
        + ' Showing the built-in guide instead. Check the PowerShell window for the connection detail.';
      showOfflineGuide(message, note);
      return;
    }

    renderGuide(data.guide);
    chatHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: JSON.stringify(data.guide) },
    );
    chatHistory = chatHistory.slice(-6);
    questionInput.value = '';
  } catch (error) {
    if (error.name === 'TypeError') {
      showOfflineGuide(
        message,
        'The live AI service could not be reached. Showing the built-in guide instead.',
      );
    } else {
      document.querySelector('#answer-title').textContent = '';
      document.querySelector('#answer-summary').textContent = error.message
        || 'Disha could not connect. Please try again.';
      document.querySelector('#official-link').hidden = true;
    }
  } finally {
    document.querySelector('#ai-loading').hidden = true;
    busy = false;
    questionInput.disabled = false;
    document.querySelector('#send-button').disabled = false;
  }
}
document.querySelector('#ask-form').addEventListener('submit', (event) => {
  event.preventDefault();
  askDisha(questionInput.value);
});

const topicPrompts = {
  pension: 'pension',
  health: 'public health insurance Ayushman Bharat',
  documents: 'birth registration certificate',
  work: 'job placement or vocational training',
};

document.querySelectorAll('.topic').forEach((button) => {
  button.addEventListener('click', () => {
    const prompt = topicPrompts[button.dataset.topic];
    if (prompt) askDisha(prompt);
  });
});

const directoryTopics = [
  { id: 'pension', en: 'Pension & elderly support', hi: 'पेंशन और बुज़ुर्ग सहायता', prompt: 'pension' },
  { id: 'lpg', en: 'LPG connection', hi: 'LPG गैस कनेक्शन', prompt: 'LPG Ujjwala gas connection' },
  { id: 'maternity', en: 'Maternity support', hi: 'मातृत्व सहायता', prompt: 'maternity support' },
  ...offlineDirectory,
];

const directoryGrid = document.querySelector('#directory-grid');
for (const topic of directoryTopics) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'directory-topic';
  button.textContent = current === 'hi' ? topic.hi : topic.en;
  button.addEventListener('click', () => {
    answer.hidden = false;
    clearGuide();
    renderGuide(createOfflineGuide(topic.prompt, guideContext()));
    answer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  directoryGrid.append(button);
}

document.querySelector('#close-answer').addEventListener('click', () => {
  answer.hidden = true;
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let activeRecognition = null;
const speechLocales = {
  as: 'as-IN', bn: 'bn-IN', brx: 'brx-IN', doi: 'doi-IN', en: 'en-IN', gu: 'gu-IN',
  hi: 'hi-IN', kn: 'kn-IN', ks: 'ks-IN', kok: 'kok-IN', mai: 'mai-IN', ml: 'ml-IN',
  mni: 'mni-IN', mr: 'mr-IN', ne: 'ne-IN', or: 'or-IN', pa: 'pa-IN', sa: 'sa-IN',
  sat: 'sat-IN', sd: 'sd-IN', ta: 'ta-IN', te: 'te-IN', ur: 'ur-IN',
};
const voiceStateCopy={
  hi:{downloading:'इस भाषा का आवाज़ पैक डाउनलोड हो रहा है… पूरा होने पर माइक फिर दबाएँ।',installed:'भाषा पैक तैयार है। बोलने के लिए माइक फिर दबाएँ।',downloadFailed:'भाषा पैक डाउनलोड नहीं हुआ। इंटरनेट जाँचें और फिर कोशिश करें।'},
  en:{downloading:'Downloading this language’s speech pack… Tap the mic again when it finishes.',installed:'Speech pack is ready. Tap the mic again to speak.',downloadFailed:'The speech pack could not download. Check your internet and try again.'}
};
const voiceErrors={
  hi:{'not-allowed':'माइक की अनुमति नहीं मिली। ब्राउज़र की साइट सेटिंग में माइक्रोफ़ोन चालू करें।','service-not-allowed':'यहाँ आवाज़ की सुविधा उपलब्ध नहीं है। मोबाइल कीबोर्ड पर माइक दबाकर बोलें।',network:'ब्राउज़र की आवाज़ सेवा तक पहुँचा नहीं जा सका। इंटरनेट जाँचें। कंप्यूटर पर लिखने वाले खाने को चुनकर Windows + H दबाएँ, या मोबाइल कीबोर्ड का माइक इस्तेमाल करें।','language-not-supported':'इस भाषा में इस ब्राउज़र पर आवाज़ की सुविधा उपलब्ध नहीं है। लिखने वाले खाने को चुनकर Windows + H दबाएँ, या लिखें।','audio-capture':'माइक्रोफ़ोन नहीं मिला। अनुमति जाँचें या मोबाइल कीबोर्ड का माइक इस्तेमाल करें।','no-speech':'आवाज़ सुनाई नहीं दी। फिर कोशिश करें या मोबाइल कीबोर्ड का माइक दबाएँ।'},
  en:{'not-allowed':'Microphone access is blocked. Allow it in your browser’s site settings, then try again.','service-not-allowed':'Voice input is unavailable here. Try the microphone on your phone keyboard instead.','network':'The browser could not reach its speech service. Check your internet. Click the text box first, then press Windows + H to dictate, or use your phone keyboard microphone.','language-not-supported':'This browser cannot transcribe the selected language. Click the text box first, then press Windows + H to dictate, or type instead.','audio-capture':'No microphone was found. Check access or use the keyboard microphone.','no-speech':'No speech was heard. Try again or use the microphone on your phone keyboard.'},
  bn:{'not-allowed':'মাইক্রোফোনের অনুমতি নেই। ব্রাউজারের সাইট সেটিংসে অনুমতি দিন।','service-not-allowed':'এখানে ভয়েস কাজ করছে না। ফোনের কিবোর্ডের মাইক ব্যবহার করে দেখুন।','network':'স্পিচ পরিষেবায় পৌঁছানো যায়নি। ইন্টারনেট দেখুন বা কিবোর্ডের মাইক ব্যবহার করুন।','audio-capture':'মাইক্রোফোন পাওয়া যায়নি। অনুমতি দেখুন বা কিবোর্ডের মাইক ব্যবহার করুন।','no-speech':'কথা শোনা যায়নি। আবার বলুন বা কিবোর্ডের মাইক ব্যবহার করুন।'},
  ta:{'not-allowed':'மைக்ரோஃபோன் அனுமதி இல்லை. உலாவி அமைப்புகளில் அனுமதிக்கவும்.','service-not-allowed':'இங்கே குரல் உள்ளீடு கிடைக்கவில்லை. கைபேசி விசைப்பலகை மைக்கைப் பயன்படுத்தவும்.','network':'குரல் சேவையை அணுக முடியவில்லை. இணையத்தைச் சரிபார்க்கவும் அல்லது விசைப்பலகை மைக்கைப் பயன்படுத்தவும்.','audio-capture':'மைக்ரோஃபோன் கிடைக்கவில்லை. அனுமதியைச் சரிபார்க்கவும் அல்லது விசைப்பலகை மைக்கைப் பயன்படுத்தவும்.','no-speech':'குரல் கேட்கவில்லை. மீண்டும் முயற்சிக்கவும் அல்லது விசைப்பலகை மைக்கைப் பயன்படுத்தவும்.'},
  te:{'not-allowed':'మైక్రోఫోన్ అనుమతి లేదు. బ్రౌజర్ సైట్ సెట్టింగ్స్‌లో అనుమతించండి.','service-not-allowed':'ఇక్కడ వాయిస్ అందుబాటులో లేదు. ఫోన్ కీబోర్డ్ మైక్‌ను ప్రయత్నించండి.','network':'వాయిస్ సేవను చేరుకోలేకపోయాం. ఇంటర్నెట్ తనిఖీ చేయండి లేదా కీబోర్డ్ మైక్ వాడండి.','audio-capture':'మైక్రోఫోన్ దొరకలేదు. అనుమతి తనిఖీ చేయండి లేదా కీబోర్డ్ మైక్ వాడండి.','no-speech':'మాట వినిపించలేదు. మళ్లీ ప్రయత్నించండి లేదా కీబోర్డ్ మైక్ వాడండి.'},
  mr:{'not-allowed':'मायक्रोफोनची परवानगी नाही. ब्राउझरच्या साइट सेटिंग्जमध्ये परवानगी द्या.','service-not-allowed':'इथे आवाजाची सुविधा उपलब्ध नाही. फोनच्या कीबोर्डवरील माइक वापरून पाहा.','network':'आवाज सेवा उपलब्ध झाली नाही. इंटरनेट तपासा किंवा कीबोर्डवरील माइक वापरा.','audio-capture':'मायक्रोफोन सापडला नाही. परवानगी तपासा किंवा कीबोर्डवरील माइक वापरा.','no-speech':'आवाज ऐकू आला नाही. पुन्हा प्रयत्न करा किंवा कीबोर्डवरील माइक वापरा.'}
};

function stopListening() {
  microphone.classList.remove('listening');
  microphoneTitle.textContent = t('micTitle');
}

microphone.addEventListener('click', () => {
  if (!SpeechRecognition) {
    microphoneHint.textContent = t('voiceUnsupported');
    notify(t('voiceUnsupported'));
    return;
  }

  if (microphone.classList.contains('listening')) {
    try {
      activeRecognition?.stop();
    } catch {
      // Recognition may already have stopped after a browser error.
    }
    stopListening();
    return;
  }

  const recognition = new SpeechRecognition();
  activeRecognition = recognition;
  recognition.lang = speechLocales[current] || 'hi-IN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const spoken = event.results?.[0]?.[0]?.transcript;
    if (!spoken) {
      notify(t('noSpeech'));
      return;
    }
    questionInput.value = spoken;
    askDisha(spoken);
  };

  recognition.onerror = (event) => {
    const message = (voiceErrors[current] || voiceErrors.en)[event.error] || t('noSpeech');
    microphoneHint.textContent = message;
    notify(message);
    if (event.error === 'network' || event.error === 'language-not-supported') {
      questionInput.focus();
    }
  };

  recognition.onend = () => {
    activeRecognition = null;
    stopListening();
    if (questionInput.value) microphoneHint.textContent = t('micHint');
  };

  const startSafely = () => {
    try {
      recognition.start();
    } catch (error) {
      activeRecognition = null;
      stopListening();
      const key = error.name === 'NotAllowedError' ? 'not-allowed' : 'no-speech';
      const message = (voiceErrors[current] || voiceErrors.en)[key] || t('noSpeech');
      microphoneHint.textContent = message;
      notify(message);
    }
  };

  microphone.classList.add('listening');
  microphoneTitle.textContent = t('listening');
  microphoneHint.textContent = t('micHint');

  if (
    typeof SpeechRecognition.available === 'function'
    && typeof SpeechRecognition.install === 'function'
    && 'processLocally' in recognition
  ) {
    SpeechRecognition.available({ langs: [recognition.lang], processLocally: true })
      .then(async (status) => {
        if (status === 'available') {
          recognition.processLocally = true;
          startSafely();
          return;
        }

        if (status === 'downloadable' || status === 'downloading') {
          stopListening();
          microphoneHint.textContent = (voiceStateCopy[current] || voiceStateCopy.en).downloading;
          const installed = await SpeechRecognition.install({
            langs: [recognition.lang],
            processLocally: true,
          });
          const message = (voiceStateCopy[current] || voiceStateCopy.en)[
            installed ? 'installed' : 'downloadFailed'
          ];
          microphoneHint.textContent = message;
          notify(message);
          return;
        }

        recognition.processLocally = false;
        startSafely();
      })
      .catch(() => {
        recognition.processLocally = false;
        startSafely();
      });
    return;
  }

  startSafely();
});

applyLanguage(language.value);

