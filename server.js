const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// URL вашей Google таблицы в формате JSON (из шага 2)
const BANKOMATS_DATA_URL = 'https://script.google.com/home/projects/1ou59JPZJZq9UVQTOLwSFPIoOxoYZI5E1UZUCqi3Ou-BIqImjXUkzQTKL/';
// API ключ Яндекс Карт
const YANDEX_MAPS_API_KEY = 'ac9862df-83e1-4188-92a2-b6e0b5f01046';

// Простой кэш для координат банкоматов
const coordinatesCache = {};

// Функция для получения координат с кэшированием
async function getCoordinates(address) {
  if (coordinatesCache[address]) {
    return coordinatesCache[address];
  }
  
  try {
    const geocodeUrl = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_MAPS_API_KEY}&format=json&geocode=${encodeURIComponent(address)}`;
    const geocodeResponse = await axios.get(geocodeUrl);
    
    if (geocodeResponse.data.response.GeoObjectCollection.featureMember.length > 0) {
      const coords = geocodeResponse.data.response.GeoObjectCollection.featureMember[0].GeoObject.Point.pos.split(' ');
      const coordinates = {
        lon: parseFloat(coords[0]),
        lat: parseFloat(coords[1])
      };
      
      // Сохраняем в кэш
      coordinatesCache[address] = coordinates;
      return coordinates;
    }
  } catch (error) {
    console.error(`Error geocoding address ${address}:`, error.message);
  }
  
  return null;
}

// Функция для расчета расстояния между двумя точками (по координатам)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Радиус Земли в км
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Расстояние в км
}

// Обработчик запросов от Алисы
app.post('/', async (req, res) => {
  const { request, session } = req.body;
  const userMessage = request.original_utterance ? request.original_utterance.toLowerCase() : '';
  
  // Сохраняем состояние диалога в session_state
  let sessionState = request.state && request.state.session ? request.state.session : {};
  
  // Объект для ответа Алисе
  let response = {
    response: {
      text: '',
      tts: '',
      buttons: [],
      end_session: false
    },
    session: session,
    version: '1.0'
  };

  // Если это первое обращение или запрос помощи
  if (request.command === '' || userMessage.includes('помощь') || userMessage.includes('что ты умеешь')) {
    response.response.text = 'Я помогу найти ближайший банкомат Альфа-Банка. Просто скажите "Найди ближайший банкомат" или укажите адрес, например, "Найди банкомат рядом с Тверской улицей".';
    return res.json(response);
  }
  
  // Если пользователь ищет банкомат
  if (userMessage.includes('банкомат')) {
    try {
      // Получаем местоположение пользователя
      let userLocation;
      let userAddress = '';
      
      // Проверяем, есть ли у нас доступ к геолокации
      if (request.meta && request.meta.client_info && request.meta.client_info.geolocation) {
        // Если доступны координаты из устройства
        userLocation = {
          lat: request.meta.client_info.geolocation.lat,
          lon: request.meta.client_info.geolocation.lon
        };
        
        // Получаем адрес по координатам для отображения
        try {
          const reverseGeocodeUrl = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_MAPS_API_KEY}&format=json&geocode=${userLocation.lon},${userLocation.lat}`;
          const reverseGeocodeResponse = await axios.get(reverseGeocodeUrl);
          
          if (reverseGeocodeResponse.data.response.GeoObjectCollection.featureMember.length > 0) {
            userAddress = reverseGeocodeResponse.data.response.GeoObjectCollection.featureMember[0].GeoObject.metaDataProperty.GeocoderMetaData.text;
          }
        } catch (error) {
          console.error('Error getting address from coordinates:', error);
        }
      } else if (userMessage.includes('рядом с') || userMessage.includes('около') || userMessage.includes('возле') || userMessage.includes('на ')) {
        // Если пользователь указал адрес
        let addressMatch;
        if (userMessage.includes('рядом с')) {
          addressMatch = userMessage.match(/рядом с (.*)/i);
        } else if (userMessage.includes('около')) {
          addressMatch = userMessage.match(/около (.*)/i);
        } else if (userMessage.includes('возле')) {
          addressMatch = userMessage.match(/возле (.*)/i);
        } else if (userMessage.includes('на ')) {
          addressMatch = userMessage.match(/на (.*)/i);
        }
        
        if (addressMatch && addressMatch[1]) {
          userAddress = addressMatch[1].trim();
        } else {
          userAddress = userMessage.replace(/найди банкомат|банкомат|рядом|с|около|возле|на/gi, '').trim();
        }
        
        // Если адрес слишком короткий, просим уточнить
        if (userAddress.length < 3) {
          response.response.text = 'Пожалуйста, укажите более точный адрес, чтобы я смог найти ближайший банкомат.';
          return res.json(response);
        }
        
        // Геокодирование адреса через Яндекс API
        const coordinates = await getCoordinates(userAddress);
        
        if (coordinates) {
          userLocation = coordinates;
        } else {
          response.response.text = 'К сожалению, не удалось определить указанный адрес. Пожалуйста, уточните его.';
          return res.json(response);
        }
      } else {
        // Если пользователь не указал адрес и нет доступа к геолокации, запрашиваем разрешение или адрес
        response.response.text = 'Чтобы найти банкомат, мне нужно знать ваше местоположение. Пожалуйста, укажите адрес, например: "Найди банкомат рядом с Тверской улицей".';
        
        // Запрашиваем разрешение на геолокацию
        if (!sessionState.askedForGeolocation) {
          sessionState.askedForGeolocation = true;
          response.session_state = sessionState;
        }
        
        return res.json(response);
      }
      
      // Получаем данные о банкоматах
      const bankomatsResponse = await axios.get(BANKOMATS_DATA_URL);
      const bankomats = bankomatsResponse.data;
      
      // Создаем массив для хранения банкоматов с координатами
      const bankomatsWithCoordinates = [];
      
      // Получаем координаты для каждого банкомата через геокодирование
      for (const bankomat of bankomats) {
        try {
          const coordinates = await getCoordinates(bankomat.Адрес);
          
          if (coordinates) {
            bankomatsWithCoordinates.push({
              ...bankomat,
              coordinates
            });
          }
        } catch (error) {
          console.error(`Error geocoding address ${bankomat.Адрес}:`, error);
          // Пропускаем банкоматы, для которых не удалось получить координаты
        }
      }
      
      // Находим ближайший банкомат
      let nearestBankomat = null;
      let minDistance = Infinity;
      
      bankomatsWithCoordinates.forEach(bankomat => {
        const distance = calculateDistance(
          userLocation.lat, 
          userLocation.lon, 
          bankomat.coordinates.lat, 
          bankomat.coordinates.lon
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestBankomat = bankomat;
        }
      });
      
      if (nearestBankomat) {
        // Формируем ответ с найденным банкоматом
        const distanceText = minDistance < 1 
          ? `${Math.round(minDistance * 1000)} метров` 
          : `${minDistance.toFixed(1)} км`;
        
        let additionalInfo = '';
        if (nearestBankomat['Дополнительная информация']) {
          additionalInfo = ` ${nearestBankomat['Дополнительная информация']}`;
        }
        
        response.response.text = `Ближайший банкомат Альфа-Банка находится по адресу: ${nearestBankomat.Адрес}. Расстояние до него: ${distanceText}. Режим работы: ${nearestBankomat['Режим работы']}.${additionalInfo} Хотите проложить маршрут?`;
        
        // Сохраняем данные о найденном банкомате для последующего построения маршрута
        sessionState.foundBankomat = {
          address: nearestBankomat.Адрес,
          coordinates: nearestBankomat.coordinates
        };
        
        sessionState.userLocation = userLocation;
        response.session_state = sessionState;
        
        // Добавляем кнопки для действий
        response.response.buttons = [
          {
            title: 'Проложить маршрут',
            hide: true
          },
          {
            title: 'Найти другой',
            hide: true
          }
        ];
      } else {
        response.response.text = 'К сожалению, не удалось найти банкоматы Альфа-Банка поблизости. Пожалуйста, уточните ваше местоположение.';
      }
    } catch (error) {
      console.error('Error:', error);
      response.response.text = 'Произошла ошибка при поиске банкомата. Пожалуйста, попробуйте позже.';
    }
  } else if (userMessage.includes('проложить маршрут') || userMessage.includes('да') || userMessage === 'да') {
    // Если пользователь согласился проложить маршрут
    if (sessionState.foundBankomat && sessionState.userLocation) {
      const bankomat = sessionState.foundBankomat;
      const userLocation = sessionState.userLocation;
      
      // Формируем URL для Яндекс Карт
      const mapsUrl = `https://yandex.ru/maps/?rtext=${userLocation.lat},${userLocation.lon}~${bankomat.coordinates.lat},${bankomat.coordinates.lon}&rtt=auto`;
      
      response.response.text = 'Вы можете открыть маршрут в Яндекс Картах по ссылке ниже.';
      response.response.buttons = [
        {
          title: 'Открыть маршрут в Яндекс Картах',
          url: mapsUrl,
          hide: false
        }
      ];
    } else {
      response.response.text = 'Сначала нужно найти банкомат. Скажите "Найди ближайший банкомат" или укажите адрес.';
    }
  } else if (userMessage.includes('найти другой')) {
    // Если пользователь хочет найти другой банкомат
    response.response.text = 'Пожалуйста, уточните адрес, рядом с которым искать другой банкомат.';
  } else {
    response.response.text = 'Я могу помочь найти ближайший банкомат Альфа-Банка. Скажите "Найди ближайший банкомат" или "Помощь", чтобы узнать больше.';
  }
  
  res.json(response);
});

// Обработчик для проверки работоспособности сервиса
app.get('/', (req, res) => {
  res.send('Сервис навыка Банкоматы Альфа-Банка работает!');
});

// Запускаем сервер
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
