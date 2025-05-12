const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// Замените на ваш URL Google Таблицы (скрипт, возвращающий JSON)
const BANKOMATS_DATA_URL = 'https://script.google.com/macros/s/AKfycbzWjsGkg2J-kNsK2hRUsMSU2ci6ygCrmme6skX5CoVG4AItDuxGBN26nmPjfQppxovOwg/exec';

// Ваш API-ключ Яндекс.Карт
const YANDEX_MAPS_API_KEY = 'ac9862df-83e1-4188-92a2-b6e0b5f01046';

// Кэш координат
const coordinatesCache = {};

// Получение координат по адресу с кэшированием
async function getCoordinates(address) {
  if (coordinatesCache[address]) {
    return coordinatesCache[address];
  }

  try {
    const geocodeUrl = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_MAPS_API_KEY}&format=json&geocode=${encodeURIComponent(address)}`;
    const response = await axios.get(geocodeUrl);
    const geoObjects = response.data.response.GeoObjectCollection.featureMember;

    if (geoObjects.length > 0) {
      const pos = geoObjects[0].GeoObject.Point.pos.split(' ');
      const coordinates = {
        lon: parseFloat(pos[0]),
        lat: parseFloat(pos[1])
      };
      coordinatesCache[address] = coordinates;
      return coordinates;
    }
  } catch (error) {
    console.error(`Ошибка геокодирования адреса ${address}:`, error.message);
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

// Основной обработчик POST-запросов
app.post('/', async (req, res) => {
  const { request, session, state } = req.body;
  const userMessage = request.original_utterance?.toLowerCase() || '';
  let sessionState = state?.session || {};

  let response = {
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

  if (!userMessage || userMessage.includes('помощь')) {
    response.response.text = 'Я помогу найти ближайший банкомат Альфа-Банка. Просто скажите "Найди банкомат рядом с улицей Ленина" или укажите адрес.';
    return res.json(response);
  }

  if (userMessage.includes('банкомат')) {
    try {
      let userLocation = null;
      let userAddress = '';

      // Попытка получить геолокацию
      if (request.meta?.location?.lat && request.meta?.location?.lon) {
        userLocation = {
          lat: request.meta.location.lat,
          lon: request.meta.location.lon
        };

        // Обратное геокодирование
        try {
          const reverseUrl = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_MAPS_API_KEY}&format=json&geocode=${userLocation.lon},${userLocation.lat}`;
          const reverseRes = await axios.get(reverseUrl);
          const geoObjects = reverseRes.data.response.GeoObjectCollection.featureMember;
          if (geoObjects.length > 0) {
            userAddress = geoObjects[0].GeoObject.metaDataProperty.GeocoderMetaData.text;
          }
        } catch (err) {
          console.error('Ошибка обратного геокодирования:', err.message);
        }

      } else {
        // Извлечение адреса из текста
        const match = userMessage.match(/(рядом с|около|возле|на)\s+(.+)/i);
        if (match && match[2]) {
          userAddress = match[2].trim();
        } else {
          userAddress = userMessage.replace(/найди банкомат|банкомат|рядом|с|около|возле|на/gi, '').trim();
        }

        if (!userAddress || userAddress.length < 3) {
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

      // Получаем список банкоматов
      const bankomatsRes = await axios.get(BANKOMATS_DATA_URL);
      const bankomats = bankomatsRes.data;

      const bankomatsWithCoords = [];

      for (const bankomat of bankomats) {
        const coords = await getCoordinates(bankomat.Адрес);
        if (coords) {
          bankomatsWithCoords.push({
            ...bankomat,
            coordinates: coords
          });
        }
      }

      // Поиск ближайшего банкомата
      let nearest = null;
      let minDistance = Infinity;

      for (const bankomat of bankomatsWithCoords) {
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

        response.response.buttons = [
          { title: 'Проложить маршрут', hide: true },
          { title: 'Найти другой', hide: true }
        ];
        response.session_state = sessionState;
      } else {
        response.response.text = 'Не удалось найти банкоматы поблизости.';
      }

    } catch (error) {
      console.error('Ошибка при поиске банкомата:', error.message);
      response.response.text = 'Произошла ошибка. Попробуйте позже.';
    }

    return res.json(response);
  }

  if (userMessage.includes('проложить маршрут') || userMessage === 'да') {
    if (sessionState.foundBankomat && sessionState.userLocation) {
      const from = sessionState.userLocation;
      const to = sessionState.foundBankomat.coordinates;

      const mapsUrl = `https://yandex.ru/maps/?rtext=${from.lat},${from.lon}~${to.lat},${to.lon}&rtt=auto`;

      response.response.text = 'Вот ссылка для построения маршрута в Яндекс Картах:';
      response.response.buttons = [
        { title: 'Открыть маршрут', url: mapsUrl, hide: false }
      ];
    } else {
      response.response.text = 'Сначала нужно найти банкомат.';
    }

    return res.json(response);
  }

  if (userMessage.includes('найти другой')) {
    response.response.text = 'Пожалуйста, укажите адрес, рядом с которым искать другой банкомат.';
    return res.json(response);
  }

  // Ответ по умолчанию
  response.response.text = 'Я могу помочь найти ближайший банкомат Альфа-Банка. Скажите "Найди банкомат рядом с улицей Ленина".';
  return res.json(response);
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
