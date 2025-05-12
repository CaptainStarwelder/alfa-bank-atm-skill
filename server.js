const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// 🔐 Настройки
const YANDEX_MAPS_API_KEY = 'ac9862df-83e1-4188-92a2-b6e0b5f01046'; // <-- Замените на ваш ключ
const BANKOMATS_DATA_URL = 'https://script.google.com/macros/s/AKfycbzWjsGkg2J-kNsK2hRUsMSU2ci6ygCrmme6skX5CoVG4AItDuxGBN26nmPjfQppxovOwg/exec'; // <-- Замените на ваш URL

// Кэш координат
const coordinatesCache = {};

// Получение координат по адресу
async function getCoordinates(address) {
  if (coordinatesCache[address]) {
    return coordinatesCache[address];
  }

  try {
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_MAPS_API_KEY}&format=json&geocode=${encodeURIComponent(address)}`;
    const res = await axios.get(url);
    const geoObjects = res.data.response.GeoObjectCollection.featureMember;

    if (geoObjects.length > 0) {
      const pos = geoObjects[0].GeoObject.Point.pos.split(' ');
      const coordinates = {
        lon: parseFloat(pos[0]),
        lat: parseFloat(pos[1])
      };
      coordinatesCache[address] = coordinates;
      return coordinates;
    }
  } catch (err) {
    console.error('Ошибка геокодирования:', err.message);
  }

  return null;
}

// Расчет расстояния между координатами
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Радиус Земли в км
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 🔧 Обработчик POST-запросов от Алисы
app.post('/', async (req, res) => {
  try {
    const { request, session, state } = req.body;
    const userMessage = request.original_utterance?.toLowerCase() || '';
    let sessionState = state?.session || {};

    const response = {
      response: {
        text: '',
        tts: '',
        buttons: [],
        end_session: false
      },
      session,
      version: '1.0',
      session_state: sessionState
    };

    // ✅ Быстрая проверка на начало диалога или "помощь"
    if (
      request.command === '' ||
      userMessage.includes('помощь') ||
      userMessage.includes('что ты умеешь') ||
      userMessage.includes('начать') ||
      userMessage.includes('привет')
    ) {
      response.response.text = 'Привет! Я помогу найти ближайший банкомат Альфа-Банка. Просто скажите, например: "Найди банкомат рядом с улицей Ленина".';
      response.response.buttons = [
        { title: 'Найти банкомат', hide: true },
        { title: 'Проложить маршрут', hide: true }
      ];
      return res.json(response);
    }

    // 🧭 Обработка запроса на поиск банкомата
    if (userMessage.includes('банкомат')) {
      let userLocation = null;
      let userAddress = '';

      // Попытка получить координаты из устройства
      if (request.meta?.location?.lat && request.meta?.location?.lon) {
        userLocation = {
          lat: request.meta.location.lat,
          lon: request.meta.location.lon
        };
      } else {
        // Извлечение адреса из текста
        const match = userMessage.match(/(рядом с|около|возле|на)\s+(.*)/i);
        if (match && match[2]) {
          userAddress = match[2].trim();
        } else {
          userAddress = userMessage.replace(/найди|банкомат|рядом|с|около|возле|на/gi, '').trim();
        }

        if (userAddress.length < 3) {
          response.response.text = 'Пожалуйста, укажите более точный адрес.';
          return res.json(response);
        }

        const coords = await getCoordinates(userAddress);
        if (coords) {
          userLocation = coords;
        } else {
          response.response.text = 'Не удалось определить координаты указанного адреса.';
          return res.json(response);
        }
      }

      // Получение списка банкоматов
      const bankomatsRes = await axios.get(BANKOMATS_DATA_URL);
      const bankomats = bankomatsRes.data;

      const bankomatsWithCoords = await Promise.all(
        bankomats.map(async (bankomat) => {
          const coords = await getCoordinates(bankomat.Адрес);
          if (coords) {
            return {
              ...bankomat,
              coordinates: coords
            };
          }
          return null;
        })
      );

      const validBankomats = bankomatsWithCoords.filter(Boolean);

      // Поиск ближайшего банкомата
      let nearest = null;
      let minDistance = Infinity;

      for (const bankomat of validBankomats) {
        const dist = calculateDistance(
          userLocation.lat,
          userLocation.lon,
          bankomat.coordinates.lat,
          bankomat.coordinates.lon
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearest = bankomat;
        }
      }

      if (nearest) {
        const distanceText = minDistance < 1
          ? `${Math.round(minDistance * 1000)} метров`
          : `${minDistance.toFixed(1)} км`;

        response.response.text = `Ближайший банкомат находится по адресу: ${nearest.Адрес}. Расстояние: ${distanceText}. Режим работы: ${nearest['Режим работы'] || 'неизвестен'}. Хотите проложить маршрут?`;

        sessionState.foundBankomat = {
          address: nearest.Адрес,
          coordinates: nearest.coordinates
        };
        sessionState.userLocation = userLocation;
        response.session_state = sessionState;

        response.response.buttons = [
          { title: 'Проложить маршрут', hide: true },
          { title: 'Найти другой', hide: true }
        ];
      } else {
        response.response.text = 'К сожалению, поблизости не найдено банкоматов.';
      }

      return res.json(response);
    }

    // 🗺 Построение маршрута
    if (userMessage.includes('проложить маршрут') || userMessage === 'да') {
      const bankomat = sessionState.foundBankomat;
      const userLoc = sessionState.userLocation;

      if (bankomat && userLoc) {
        const mapsUrl = `https://yandex.ru/maps/?rtext=${userLoc.lat},${userLoc.lon}~${bankomat.coordinates.lat},${bankomat.coordinates.lon}&rtt=auto`;
        response.response.text = 'Вот ссылка для построения маршрута в Яндекс Картах:';
        response.response.buttons = [
          {
            title: 'Открыть маршрут',
            url: mapsUrl,
            hide: false
          }
        ];
      } else {
        response.response.text = 'Сначала нужно найти банкомат. Скажите, например: "Найди банкомат рядом с улицей Ленина".';
      }

      return res.json(response);
    }

    // 🔁 Найти другой банкомат
    if (userMessage.includes('найти другой')) {
      response.response.text = 'Пожалуйста, укажите адрес, рядом с которым искать другой банкомат.';
      return res.json(response);
    }

    // Ответ по умолчанию
    response.response.text = 'Я могу помочь найти ближайший банкомат Альфа-Банка. Просто скажите: "Найди банкомат рядом с улицей Ленина".';
    return res.json(response);
  } catch (error) {
    console.error('Ошибка в webhook:', error.message);
    return res.json({
      response: {
        text: 'Произошла ошибка на сервере. Попробуйте позже.',
        end_session: true
      },
      version: '1.0'
    });
  }
});

// Проверка работоспособности
app.get('/', (req, res) => {
  res.send('Сервис навыка Банкоматы Альфа-Банка работает!');
});

// Запуск сервера
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
