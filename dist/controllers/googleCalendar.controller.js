import { google } from 'googleapis';
const calendar = google.calendar('v3');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
// Configurar autenticação (melhor em arquivo separado)
const getAuth = async () => {
    return new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: SCOPES,
    });
};
export const syncEmployeeCalendar = async (req, res) => {
    try {
        const auth = await getAuth();
        const authClient = await auth.getClient();
        // 1. Criar calendário para o colaborador
        const { data: calendarData } = await calendar.calendars.insert({
            auth: authClient,
            requestBody: {
                summary: `Horários - ${req.body.employeeName}`,
                timeZone: 'America/Sao_Paulo'
            }
        });
        // 2. Adicionar eventos
        const events = createEventsFromSchedule(req.body.workSchedule);
        await addEventsToCalendar(authClient, calendarData.id, events);
        res.status(201).json({
            calendarId: calendarData.id,
            publicUrl: calendarData.htmlLink,
            embedUrl: `https://calendar.google.com/calendar/embed?src=${calendarData.id}`
        });
    }
    catch (error) {
        console.error('Erro na sincronização:', error);
        res.status(500).json({
            message: 'Erro ao sincronizar com Google Calendar',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
};
// Funções auxiliares
const createEventsFromSchedule = (schedule) => {
    return Object.entries(schedule).flatMap(([day, times]) => times.map(time => ({
        summary: 'Horário de Trabalho',
        start: createEventTime(time.split('-')[0]),
        end: createEventTime(time.split('-')[1]),
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${mapDayToGoogle(day)}`],
        colorId: mapDayToColor(day)
    })));
};
const createEventTime = (time) => ({
    dateTime: `2023-01-01T${time}:00-03:00`,
    timeZone: 'America/Sao_Paulo'
});
const mapDayToGoogle = (day) => ({
    seg: 'MO',
    ter: 'TU',
    qua: 'WE',
    qui: 'TH',
    sex: 'FR',
    sab: 'SA',
    dom: 'SU'
})[day];
const mapDayToColor = (day) => ({
    seg: '1', // Azul
    ter: '2', // Verde
    qua: '3', // Roxo
    qui: '4', // Vermelho
    sex: '5', // Laranja
    sab: '6', // Amarelo
    dom: '7' // Cinza
})[day];
const addEventsToCalendar = async (auth, calendarId, events) => {
    return Promise.all(events.map(event => calendar.events.insert({
        auth,
        calendarId,
        requestBody: event
    })));
};
