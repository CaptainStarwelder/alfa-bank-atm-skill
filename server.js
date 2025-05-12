const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// URL вашей Google таблицы в формате JSON (из шага 2)
const BANKOMATS_DATA_URL = 'https://script.google.com/u/0/home/projects/1ou59JPZJZq9UVQTOLwSFPIoOxoYZI5E1UZUCqi3Ou-BIqImjXUkzQTKL';
// API ключ Яндекс Карт
const YANDEX_MAPS_API_KEY = 'ac9862df-83e1-4188-92a2-b6e0b5f01046';

// Обработчик запросов от Алисы
app.post('/', async (req, res) => {
  const { request, session } = req.body;
  const userMessage = request.command.toLowerCase();
  
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
    response.response.text = 'Я помогу найти ближайший банкомат Альфа-Банка. Просто скажите "Найди ближайший банкомат" или укажите адрес, например, "Найди банкомат рядом с Ленинградским проспектом".';
    return res.json(response);
  }
  
  // Если пользователь ищет банкомат
  if (userMessage.includes('банкомат')) {
    try {
      // Получаем местоположение пользователя
      let userLocation;
      let userAddress = '';
      
      if (request.geo_ip && request.geo_ip.lat && request.geo_ip.lon) {
        // Если доступны координаты из IP
        userLocation = {
          lat: request.geo_ip.lat,
          lon: request.geo_ip.lon
        };
        
        // Получаем адрес по координатам для отображения
        const reverseGeocodeUrl = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_MAPS_API_KEY}&format=json&geocode=${userLocation.lon},${userLocation.lat}`;
        const reverseGeocodeResponse = await axios.get(reverseGeocodeUrl);
        
        if (reverseGeocodeResponse.data.response.GeoObjectCollection.featureMember.length > 0) {
          userAddress = reverseGeocodeResponse.data.response.GeoObjectCollection.featureMember[0].GeoObject.metaDataProperty.GeocoderMetaData.text;
        }
      } else if (userMessage.includes('рядом с')) {
        // Если пользователь указал адрес
        const addressMatch = userMessage.match(/рядом с (.*)/i);
        if (addressMatch && addressMatch[1]) {
          userAddress = addressMatch[1];
        } else {
          userAddress = userMessage.replace(/найди банкомат|банкомат|рядом|с|около|возле/gi, '').trim();
        }
        
        // Если адрес слишком короткий, просим уточнить
        if (userAddress.length < 3) {
          response.response.text = 'Пожалуйста, укажите более точный адрес, чтобы я смог найти ближайший банкомат.';
          return res.json(response);
        }
        
        // Геокодирование адреса через Яндекс API
        const geocodeUrl = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_MAPS_API_KEY}&format=json&geocode=${encodeURIComponent(userAddress)}`;
        const geocodeResponse = await axios.get(geocodeUrl);
        
        if (geocodeResponse.data.response.GeoObjectCollection.featureMember.length > 0) {
          const coords = geocodeResponse.data.response.GeoObjectCollection.featureMember[0].GeoObject.Point.pos.split(' ');
          userLocation = {
            lon: parseFloat(coords[0]),
            lat: parseFloat(coords[1])
          };
          
          // Получаем полный адрес из ответа геокодера
          userAddress = geocodeResponse.data.response.GeoObjectCollection.featureMember[0].GeoObject.metaDataProperty.GeocoderMetaData.text;
        } else {
          response.response.text = 'К сожалению, не удалось определить указанный адрес. Пожалуйста, уточните его.';
          return res.json(response);
        }
      } else {
        response.response.text = 'Чтобы найти банкомат, мне нужно знать ваше местоположение. Пожалуйста, разрешите доступ к геолокации или укажите адрес, например: "Найди банкомат рядом с Тверской улицей".';
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
          const geocodeUrl = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_MAPS_API_KEY}&format=json&geocode=${encodeURIComponent(bankomat.Адрес)}`;
          const geocodeResponse = await axios.get(geocodeUrl);
          
          if (geocodeResponse.data.response.GeoObjectCollection.featureMember.length > 0) {
            const coords = geocodeResponse.data.response.GeoObjectCollection.featureMember[0].GeoObject.Point.pos.split(' ');
            bankomatsWithCoordinates.push({
              ...bankomat,
              coordinates: {
                lon: parseFloat(coords[0]),
                lat: parseFloat(coords[1])
              }
            });
          }
        } catch (error) {
          console.error(`Error geocoding address ${bankomat.Адрес}:`, error);
          // Пропускаем банкоматы, для которых не удалось получить координаты
        }
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
        
        // Добавляем кнопки для действий
        response.response.buttons = [
          {
            title: 'Проложить маршрут',
            url: `yandexmaps://maps.yandex.ru/?rtext=${userLocation.lat},${userLocation.lon}~${nearestBankomat.coordinates.lat},${nearestBankomat.coordinates.lon}&rtt=auto`,
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
  } else if (userMessage.includes('проложить маршрут') || userMessage.includes('да')) {
    // Предполагаем, что пользователь согласился проложить маршрут
    response.response.text = 'Открываю Яндекс Карты для построения маршрута до банкомата.';
    response.response.end_session = true;
  } else {
    response.response.text = 'Я могу помочь найти ближайший банкомат Альфа-Банка. Скажите "Найди ближайший банкомат" или "Помощь", чтобы узнать больше.';
  }
  
  res.json(response);
});

// Запускаем сервер
const listener = app.listen(process.env.PORT, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});
