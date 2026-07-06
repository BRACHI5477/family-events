# מבוסס Node 22 (כולל SQLite מובנה)
FROM node:22-slim

WORKDIR /app

# התקנת תלויות
COPY package*.json ./
RUN npm install --omit=dev

# העתקת קוד המערכת
COPY . .

# נתוני האפליקציה נשמרים בנתיב שניתן למפות לדיסק קבוע
ENV DATA_DIR=/app/data
ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
