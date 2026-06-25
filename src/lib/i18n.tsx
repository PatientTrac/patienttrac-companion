import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type Lang = 'en' | 'es' | 'fr'
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'EN' }, { code: 'es', label: 'ES' }, { code: 'fr', label: 'FR' },
]

type Dict = Record<string, string>

const EN: Dict = {
  'tagline': 'Your care, between visits',
  'nav.today': 'Today', 'nav.medications': 'Medications', 'nav.diet': 'Diet',
  'nav.exercise': 'Exercise', 'nav.vitals': 'Vitals & devices', 'nav.journal': 'Journal',
  'nav.treatment': 'Treatment & learning', 'nav.messages': 'Messages', 'nav.progress': 'Progress',
  'msg.title': 'Messages', 'msg.subtitle': 'Send a non-urgent message to your care team and see their replies.',
  'msg.empty': 'No messages yet. Start the conversation below.', 'msg.placeholder': 'Write a message…',
  'msg.send': 'Send', 'msg.sending': 'Sending…', 'msg.you': 'You', 'msg.careTeam': 'Care team',
  'msg.disclaimer': 'Messages are reviewed by your care team during business hours, not in real time. This is not for emergencies — if you have a medical emergency, call your local emergency number.',
  'prog.title': 'Your progress', 'prog.subtitle': "A look at what you've tracked over the last 30 days.",
  'prog.adherence': 'Doses logged', 'prog.avgMood': 'Average mood', 'prog.avgPain': 'Average pain',
  'prog.painMood': 'Pain & mood', 'prog.pain': 'Pain', 'prog.mood': 'Mood', 'prog.doses': 'Doses logged per day',
  'prog.empty': 'Nothing tracked yet. As you log meds, check-ins and vitals, your trends will appear here.',
  'prog.trendEasing': 'Your pain has been easing', 'prog.trendMention': 'Trending up — worth mentioning to your care team', 'prog.trendSteady': 'Holding steady',
  'prog.disclaimer': "This shows what you've logged — it isn't medical advice. If something feels wrong or is getting worse, tell your care team. In an emergency, call your local emergency number.",
  'common.signOut': 'Sign out', 'common.private': 'Private to you & your care team',
  'common.loading': 'Loading…', 'common.save': 'Save', 'common.add': 'Add', 'common.cancel': 'Cancel',
  'common.thinking': 'Thinking…', 'common.ask': 'Ask a question…', 'common.today': 'today',
  'common.emergency': 'In an emergency, call your local emergency number.',

  'auth.welcomeBack': 'Welcome back', 'auth.create': 'Create your account',
  'auth.email': 'Email', 'auth.password': 'Password', 'auth.signIn': 'Sign in', 'auth.signUp': 'Sign up',
  'auth.new': 'New here?', 'auth.have': 'Already have an account?',
  'auth.createLink': 'Create an account', 'auth.signInLink': 'Sign in',
  'auth.checkEmail': 'Check your email to confirm your account, then sign in.',
  'auth.oneMore': 'One more step', 'auth.inviteIntro': 'Enter the invite code from your care team to connect your account to your records.',
  'auth.code': 'Invite code', 'auth.connect': 'Connect my account', 'auth.connecting': 'Connecting…',

  'today.greeting': 'Welcome back', 'today.planTitle': 'Your care plan',
  'today.planBody': 'Take your medications as scheduled, keep up gentle movement, and log how you feel each day. Your care team is watching your progress between visits.',
  'today.viewPlan': 'View plan & ask a question',
  'today.meds': 'Medications', 'today.medsStatus': '{taken} of {total} taken today',
  'today.checkin': "Today's check-in", 'today.checkinDone': 'Completed', 'today.checkinNot': 'Not done yet',
  'today.vital': 'Latest vital', 'today.noReadings': 'No readings yet',
  'today.meals': 'Meals logged', 'today.activity': 'Activity logged', 'today.count': '{n} today',

  'meds.title': 'Medications', 'meds.subtitle': 'Tap a medication when you take it.',
  'meds.empty': 'No medications yet. Add the ones from your care plan below.',
  'meds.taken': 'Taken', 'meds.mark': 'Mark taken', 'meds.add': 'Add a medication',
  'meds.name': 'Medication name', 'meds.dose': 'Dose (e.g. 10 mg)', 'meds.freq': 'Frequency',
  'meds.disclaimer': "This is a personal log — it doesn't change your prescription. To start, stop, or adjust any medication, talk to your care team.",

  'diet.title': 'Diet', 'diet.subtitle': 'Log what you eat and drink. It helps your team spot patterns in your recovery.',
  'diet.placeholder': 'What did you have?', 'diet.empty': 'Nothing logged yet today.',
  'diet.aiLabel': 'Ask about eating well for your recovery',
  'diet.aiDisclaimer': 'General nutrition education only — not a diet plan. For meal plans or restrictions specific to you, your care team or a registered dietitian is the right place.',
  'diet.q1': 'Why does protein matter in recovery?', 'diet.q2': 'Foods that support healing?', 'diet.q3': 'Is it okay to have coffee?',
  'meal.Breakfast': 'Breakfast', 'meal.Lunch': 'Lunch', 'meal.Dinner': 'Dinner', 'meal.Snack': 'Snack', 'meal.Drink': 'Drink',

  'ex.title': 'Exercise & movement', 'ex.subtitle': 'Track the gentle movement and rehab exercises from your plan, and learn the why behind them.',
  'ex.name': 'Exercise (e.g. heel slides)', 'ex.detail': 'Sets / reps / minutes', 'ex.log': 'Log', 'ex.empty': 'Nothing logged yet today.',
  'ex.aiLabel': 'Learn about your movement plan',
  'ex.aiDisclaimer': "This explains the kind of movement in your plan in general terms. It won't add new exercises — your physical therapist and care team set that. Stop and contact them if movement causes new or worse pain.",
  'ex.q1': 'Why are ankle pumps important?', 'ex.q2': 'What does range of motion mean?', 'ex.q3': 'How do I know if I am overdoing it?',

  'vit.title': 'Vitals & devices', 'vit.subtitle': 'Add a reading by hand below. Automatic sync from watches and devices is coming soon.',
  'vit.connect': 'Connect', 'vit.requiresApp': 'Requires the mobile app', 'vit.comingSoon': 'Coming soon', 'vit.recent': 'Recent readings', 'vit.none': 'No readings yet.', 'vit.add': 'Add reading', 'vit.value': 'Value',
  'vit.disclaimer': "Readings from consumer watches and devices are for information only and aren't a medical diagnosis. If something doesn't feel right, contact your care team.",
  'vit.heart_rate': 'Heart rate', 'vit.bp_systolic': 'BP systolic', 'vit.spo2': 'SpO₂', 'vit.weight_kg': 'Weight', 'vit.temp_c': 'Temperature',

  'jr.title': 'Daily check-in', 'jr.subtitle': 'A quick note on how today went. Your care team can see this between visits.',
  'jr.feeling': 'How are you feeling?', 'jr.pain': 'Pain level', 'jr.note': 'Anything you want your team to know? (swelling, sleep, questions…)',
  'jr.save': 'Save check-in', 'jr.past': 'Past check-ins',
  'jr.flag': "High pain noted — we'll flag this for your care team. If this is an emergency, call your local emergency number now.",

  'tr.title': 'Treatment & learning', 'tr.subtitle': "Understand your plan, and ask anything you're unsure about.",
  'tr.planDefault': 'Your care team will add your plan here. In the meantime you can ask general questions about recovery and what to expect.',
  'tr.planFallbackTitle': 'Your care plan',
  'tr.aiLabel': 'Ask about your plan',
  'tr.aiDisclaimer': "This assistant explains your plan for learning only. It can't diagnose, and it won't change your medications or doses — your care team makes those decisions.",
  'tr.q1': 'What does my recovery plan involve?', 'tr.q2': 'What warning signs should I watch for?', 'tr.q3': 'How long does recovery usually take?',
  'ai.fallback': "I can explain general, plan-based guidance, but I'm having trouble connecting right now. For anything specific to your situation, please reach out to your care team.",

  'nav.selfchart': 'My health record',
  'sc.title': 'My health record',
  'sc.subtitle': 'Your care plan, medications, results, and learning — all in one place.',
  'sc.carePlan': 'Care plan',
  'sc.meds': 'My medications',
  'sc.medsCore': 'Core regimen',
  'sc.medsActive': 'All active medications',
  'sc.medsEmpty': 'No active medications on file.',
  'sc.labs': 'My results over time',
  'sc.labsEmpty': 'No lab results on file yet.',
  'sc.edu': 'Learn about my treatment',
  'sc.eduEmpty': 'No learning entries yet.',
  'sc.vitalsTitle': 'Device readings',
  'sc.vitalsEmpty': 'No device readings yet. Device sync appears here when connected.',
  'sc.autoTranslated': 'Auto-translated',
  'sc.abnormal': 'Abnormal',
  'sc.refRange': 'Ref:',
}

const ES: Dict = {
  'tagline': 'Tu cuidado, entre visitas',
  'nav.today': 'Hoy', 'nav.medications': 'Medicamentos', 'nav.diet': 'Alimentación',
  'nav.exercise': 'Ejercicio', 'nav.vitals': 'Signos y dispositivos', 'nav.journal': 'Diario',
  'nav.treatment': 'Tratamiento y aprendizaje', 'nav.messages': 'Mensajes', 'nav.progress': 'Progreso',
  'msg.title': 'Mensajes', 'msg.subtitle': 'Envía un mensaje no urgente a tu equipo de cuidado y ve sus respuestas.',
  'msg.empty': 'Aún no hay mensajes. Inicia la conversación abajo.', 'msg.placeholder': 'Escribe un mensaje…',
  'msg.send': 'Enviar', 'msg.sending': 'Enviando…', 'msg.you': 'Tú', 'msg.careTeam': 'Equipo de cuidado',
  'msg.disclaimer': 'Tu equipo de cuidado revisa los mensajes en horario laboral, no en tiempo real. Esto no es para emergencias — si tienes una emergencia médica, llama a tu número de emergencias local.',
  'prog.title': 'Tu progreso', 'prog.subtitle': 'Un vistazo a lo que registraste en los últimos 30 días.',
  'prog.adherence': 'Dosis registradas', 'prog.avgMood': 'Ánimo promedio', 'prog.avgPain': 'Dolor promedio',
  'prog.painMood': 'Dolor y ánimo', 'prog.pain': 'Dolor', 'prog.mood': 'Ánimo', 'prog.doses': 'Dosis registradas por día',
  'prog.empty': 'Aún no hay registros. A medida que registres medicamentos, chequeos y signos, tus tendencias aparecerán aquí.',
  'prog.trendEasing': 'Tu dolor ha ido disminuyendo', 'prog.trendMention': 'Va en aumento — coméntalo con tu equipo de cuidado', 'prog.trendSteady': 'Se mantiene estable',
  'prog.disclaimer': 'Esto muestra lo que registraste — no es consejo médico. Si algo no se siente bien o empeora, dilo a tu equipo de cuidado. En una emergencia, llama a tu número de emergencias local.',
  'common.signOut': 'Cerrar sesión', 'common.private': 'Privado para ti y tu equipo de cuidado',
  'common.loading': 'Cargando…', 'common.save': 'Guardar', 'common.add': 'Agregar', 'common.cancel': 'Cancelar',
  'common.thinking': 'Pensando…', 'common.ask': 'Haz una pregunta…', 'common.today': 'hoy',
  'common.emergency': 'En una emergencia, llama al número de emergencias local.',

  'auth.welcomeBack': 'Bienvenido de nuevo', 'auth.create': 'Crea tu cuenta',
  'auth.email': 'Correo electrónico', 'auth.password': 'Contraseña', 'auth.signIn': 'Iniciar sesión', 'auth.signUp': 'Registrarse',
  'auth.new': '¿Nuevo aquí?', 'auth.have': '¿Ya tienes una cuenta?',
  'auth.createLink': 'Crear una cuenta', 'auth.signInLink': 'Iniciar sesión',
  'auth.checkEmail': 'Revisa tu correo para confirmar tu cuenta y luego inicia sesión.',
  'auth.oneMore': 'Un paso más', 'auth.inviteIntro': 'Ingresa el código de invitación de tu equipo de cuidado para vincular tu cuenta con tu expediente.',
  'auth.code': 'Código de invitación', 'auth.connect': 'Vincular mi cuenta', 'auth.connecting': 'Vinculando…',

  'today.greeting': 'Bienvenido de nuevo', 'today.planTitle': 'Tu plan de cuidado',
  'today.planBody': 'Toma tus medicamentos según lo indicado, mantén movimiento suave y registra cómo te sientes cada día. Tu equipo de cuidado sigue tu progreso entre visitas.',
  'today.viewPlan': 'Ver plan y hacer una pregunta',
  'today.meds': 'Medicamentos', 'today.medsStatus': '{taken} de {total} tomados hoy',
  'today.checkin': 'Registro de hoy', 'today.checkinDone': 'Completado', 'today.checkinNot': 'Pendiente',
  'today.vital': 'Último signo vital', 'today.noReadings': 'Sin lecturas aún',
  'today.meals': 'Comidas registradas', 'today.activity': 'Actividad registrada', 'today.count': '{n} hoy',

  'meds.title': 'Medicamentos', 'meds.subtitle': 'Toca un medicamento cuando lo tomes.',
  'meds.empty': 'Aún no hay medicamentos. Agrega los de tu plan de cuidado abajo.',
  'meds.taken': 'Tomado', 'meds.mark': 'Marcar tomado', 'meds.add': 'Agregar un medicamento',
  'meds.name': 'Nombre del medicamento', 'meds.dose': 'Dosis (ej. 10 mg)', 'meds.freq': 'Frecuencia',
  'meds.disclaimer': 'Este es un registro personal — no cambia tu receta. Para iniciar, suspender o ajustar un medicamento, habla con tu equipo de cuidado.',

  'diet.title': 'Alimentación', 'diet.subtitle': 'Registra lo que comes y bebes. Ayuda a tu equipo a ver patrones en tu recuperación.',
  'diet.placeholder': '¿Qué comiste?', 'diet.empty': 'Nada registrado hoy todavía.',
  'diet.aiLabel': 'Pregunta sobre comer bien para tu recuperación',
  'diet.aiDisclaimer': 'Solo educación nutricional general — no es un plan de dieta. Para planes o restricciones específicas, tu equipo de cuidado o un dietista titulado es el lugar indicado.',
  'diet.q1': '¿Por qué importa la proteína en la recuperación?', 'diet.q2': '¿Alimentos que ayudan a sanar?', 'diet.q3': '¿Puedo tomar café?',
  'meal.Breakfast': 'Desayuno', 'meal.Lunch': 'Almuerzo', 'meal.Dinner': 'Cena', 'meal.Snack': 'Merienda', 'meal.Drink': 'Bebida',

  'ex.title': 'Ejercicio y movimiento', 'ex.subtitle': 'Registra el movimiento suave y los ejercicios de rehabilitación de tu plan, y aprende el porqué.',
  'ex.name': 'Ejercicio (ej. deslizamientos de talón)', 'ex.detail': 'Series / reps / minutos', 'ex.log': 'Registrar', 'ex.empty': 'Nada registrado hoy todavía.',
  'ex.aiLabel': 'Aprende sobre tu plan de movimiento',
  'ex.aiDisclaimer': 'Explica en términos generales el tipo de movimiento de tu plan. No agregará ejercicios nuevos — eso lo define tu fisioterapeuta y equipo de cuidado. Detente y contáctalos si el movimiento causa dolor nuevo o peor.',
  'ex.q1': '¿Por qué son importantes los bombeos de tobillo?', 'ex.q2': '¿Qué significa rango de movimiento?', 'ex.q3': '¿Cómo sé si me estoy excediendo?',

  'vit.title': 'Signos y dispositivos', 'vit.subtitle': 'Agrega una lectura a mano abajo. La sincronización automática desde relojes y dispositivos llegará pronto.',
  'vit.connect': 'Conectar', 'vit.requiresApp': 'Requiere la app móvil', 'vit.comingSoon': 'Próximamente', 'vit.recent': 'Lecturas recientes', 'vit.none': 'Sin lecturas aún.', 'vit.add': 'Agregar lectura', 'vit.value': 'Valor',
  'vit.disclaimer': 'Las lecturas de relojes y dispositivos de consumo son solo informativas y no son un diagnóstico médico. Si algo no se siente bien, contacta a tu equipo de cuidado.',
  'vit.heart_rate': 'Frecuencia cardíaca', 'vit.bp_systolic': 'Presión sistólica', 'vit.spo2': 'SpO₂', 'vit.weight_kg': 'Peso', 'vit.temp_c': 'Temperatura',

  'jr.title': 'Registro diario', 'jr.subtitle': 'Una nota rápida sobre cómo fue tu día. Tu equipo de cuidado puede verla entre visitas.',
  'jr.feeling': '¿Cómo te sientes?', 'jr.pain': 'Nivel de dolor', 'jr.note': '¿Algo que quieras que sepa tu equipo? (hinchazón, sueño, preguntas…)',
  'jr.save': 'Guardar registro', 'jr.past': 'Registros anteriores',
  'jr.flag': 'Dolor alto registrado — lo marcaremos para tu equipo de cuidado. Si es una emergencia, llama ahora al número de emergencias local.',

  'tr.title': 'Tratamiento y aprendizaje', 'tr.subtitle': 'Comprende tu plan y pregunta lo que no tengas claro.',
  'tr.planDefault': 'Tu equipo de cuidado agregará tu plan aquí. Mientras tanto puedes hacer preguntas generales sobre la recuperación.',
  'tr.planFallbackTitle': 'Tu plan de cuidado',
  'tr.aiLabel': 'Pregunta sobre tu plan',
  'tr.aiDisclaimer': 'Este asistente explica tu plan solo con fines educativos. No puede diagnosticar ni cambiar tus medicamentos o dosis — esas decisiones las toma tu equipo de cuidado.',
  'tr.q1': '¿Qué incluye mi plan de recuperación?', 'tr.q2': '¿Qué señales de alerta debo vigilar?', 'tr.q3': '¿Cuánto suele durar la recuperación?',
  'ai.fallback': 'Puedo explicar orientación general basada en tu plan, pero tengo problemas para conectarme ahora. Para algo específico de tu situación, contacta a tu equipo de cuidado.',

  'nav.selfchart': 'Mi expediente',
  'sc.title': 'Mi expediente de salud',
  'sc.subtitle': 'Tu plan de cuidado, medicamentos, resultados y aprendizaje — en un solo lugar.',
  'sc.carePlan': 'Plan de cuidado',
  'sc.meds': 'Mis medicamentos',
  'sc.medsCore': 'Régimen principal',
  'sc.medsActive': 'Todos los medicamentos activos',
  'sc.medsEmpty': 'No hay medicamentos activos en tu expediente.',
  'sc.labs': 'Mis resultados a lo largo del tiempo',
  'sc.labsEmpty': 'Aún no hay resultados de laboratorio en tu expediente.',
  'sc.edu': 'Aprende sobre mi tratamiento',
  'sc.eduEmpty': 'Aún no hay entradas de aprendizaje.',
  'sc.vitalsTitle': 'Lecturas de dispositivos',
  'sc.vitalsEmpty': 'Aún no hay lecturas de dispositivos. La sincronización automática aparecerá aquí cuando estés conectado.',
  'sc.autoTranslated': 'Traducción automática',
  'sc.abnormal': 'Anormal',
  'sc.refRange': 'Ref:',
}

const FR: Dict = {
  'tagline': 'Vos soins, entre les visites',
  'nav.today': "Aujourd'hui", 'nav.medications': 'Médicaments', 'nav.diet': 'Alimentation',
  'nav.exercise': 'Exercice', 'nav.vitals': 'Constantes et appareils', 'nav.journal': 'Journal',
  'nav.treatment': 'Traitement et apprentissage', 'nav.messages': 'Messages', 'nav.progress': 'Progrès',
  'msg.title': 'Messages', 'msg.subtitle': "Envoyez un message non urgent à votre équipe soignante et consultez ses réponses.",
  'msg.empty': 'Aucun message pour le moment. Démarrez la conversation ci-dessous.', 'msg.placeholder': 'Écrire un message…',
  'msg.send': 'Envoyer', 'msg.sending': 'Envoi…', 'msg.you': 'Vous', 'msg.careTeam': 'Équipe soignante',
  'msg.disclaimer': "Les messages sont consultés par votre équipe soignante aux heures ouvrables, pas en temps réel. Ceci n'est pas destiné aux urgences — en cas d'urgence médicale, appelez votre numéro d'urgence local.",
  'prog.title': 'Vos progrès', 'prog.subtitle': 'Un aperçu de ce que vous avez suivi au cours des 30 derniers jours.',
  'prog.adherence': 'Doses enregistrées', 'prog.avgMood': 'Humeur moyenne', 'prog.avgPain': 'Douleur moyenne',
  'prog.painMood': 'Douleur et humeur', 'prog.pain': 'Douleur', 'prog.mood': 'Humeur', 'prog.doses': 'Doses enregistrées par jour',
  'prog.empty': "Rien de suivi pour l'instant. À mesure que vous enregistrez vos médicaments, bilans et constantes, vos tendances apparaîtront ici.",
  'prog.trendEasing': 'Votre douleur diminue', 'prog.trendMention': 'En hausse — à signaler à votre équipe soignante', 'prog.trendSteady': 'Stable',
  'prog.disclaimer': "Ceci montre ce que vous avez enregistré — ce n'est pas un avis médical. Si quelque chose ne va pas ou s'aggrave, parlez-en à votre équipe soignante. En cas d'urgence, appelez votre numéro d'urgence local.",
  'common.signOut': 'Se déconnecter', 'common.private': 'Privé entre vous et votre équipe soignante',
  'common.loading': 'Chargement…', 'common.save': 'Enregistrer', 'common.add': 'Ajouter', 'common.cancel': 'Annuler',
  'common.thinking': 'Réflexion…', 'common.ask': 'Posez une question…', 'common.today': "aujourd'hui",
  'common.emergency': "En cas d'urgence, appelez le numéro d'urgence local.",

  'auth.welcomeBack': 'Bon retour', 'auth.create': 'Créez votre compte',
  'auth.email': 'E-mail', 'auth.password': 'Mot de passe', 'auth.signIn': 'Se connecter', 'auth.signUp': "S'inscrire",
  'auth.new': 'Nouveau ici ?', 'auth.have': 'Vous avez déjà un compte ?',
  'auth.createLink': 'Créer un compte', 'auth.signInLink': 'Se connecter',
  'auth.checkEmail': 'Vérifiez votre e-mail pour confirmer votre compte, puis connectez-vous.',
  'auth.oneMore': 'Encore une étape', 'auth.inviteIntro': "Saisissez le code d'invitation de votre équipe soignante pour relier votre compte à votre dossier.",
  'auth.code': "Code d'invitation", 'auth.connect': 'Relier mon compte', 'auth.connecting': 'Connexion…',

  'today.greeting': 'Bon retour', 'today.planTitle': 'Votre plan de soins',
  'today.planBody': "Prenez vos médicaments comme prévu, maintenez un mouvement doux et notez comment vous vous sentez chaque jour. Votre équipe suit vos progrès entre les visites.",
  'today.viewPlan': 'Voir le plan et poser une question',
  'today.meds': 'Médicaments', 'today.medsStatus': '{taken} sur {total} pris aujourd\'hui',
  'today.checkin': "Bilan du jour", 'today.checkinDone': 'Terminé', 'today.checkinNot': 'Pas encore fait',
  'today.vital': 'Dernière constante', 'today.noReadings': 'Aucune mesure',
  'today.meals': 'Repas notés', 'today.activity': 'Activité notée', 'today.count': "{n} aujourd'hui",

  'meds.title': 'Médicaments', 'meds.subtitle': 'Touchez un médicament quand vous le prenez.',
  'meds.empty': 'Aucun médicament pour le moment. Ajoutez ceux de votre plan ci-dessous.',
  'meds.taken': 'Pris', 'meds.mark': 'Marquer pris', 'meds.add': 'Ajouter un médicament',
  'meds.name': 'Nom du médicament', 'meds.dose': 'Dose (ex. 10 mg)', 'meds.freq': 'Fréquence',
  'meds.disclaimer': "Ceci est un journal personnel — il ne modifie pas votre ordonnance. Pour commencer, arrêter ou ajuster un médicament, parlez-en à votre équipe soignante.",

  'diet.title': 'Alimentation', 'diet.subtitle': 'Notez ce que vous mangez et buvez. Cela aide votre équipe à repérer des tendances dans votre rétablissement.',
  'diet.placeholder': "Qu'avez-vous pris ?", 'diet.empty': 'Rien noté aujourd\'hui.',
  'diet.aiLabel': 'Questions sur une bonne alimentation pour votre rétablissement',
  'diet.aiDisclaimer': "Éducation nutritionnelle générale uniquement — pas un régime. Pour des plans ou restrictions personnalisés, votre équipe soignante ou une diététicienne diplômée est l'interlocuteur approprié.",
  'diet.q1': 'Pourquoi les protéines comptent-elles dans la guérison ?', 'diet.q2': 'Aliments qui aident à guérir ?', 'diet.q3': 'Puis-je boire du café ?',
  'meal.Breakfast': 'Petit-déjeuner', 'meal.Lunch': 'Déjeuner', 'meal.Dinner': 'Dîner', 'meal.Snack': 'Collation', 'meal.Drink': 'Boisson',

  'ex.title': 'Exercice et mouvement', 'ex.subtitle': 'Suivez le mouvement doux et les exercices de rééducation de votre plan, et comprenez pourquoi.',
  'ex.name': 'Exercice (ex. glissés de talon)', 'ex.detail': 'Séries / répétitions / minutes', 'ex.log': 'Noter', 'ex.empty': 'Rien noté aujourd\'hui.',
  'ex.aiLabel': 'En savoir plus sur votre plan de mouvement',
  'ex.aiDisclaimer': "Ceci explique en termes généraux le type de mouvement de votre plan. Il n'ajoutera pas de nouveaux exercices — c'est votre kinésithérapeute et votre équipe qui les définissent. Arrêtez et contactez-les si le mouvement provoque une douleur nouvelle ou plus forte.",
  'ex.q1': 'Pourquoi les pompes de cheville sont-elles importantes ?', 'ex.q2': 'Que signifie amplitude de mouvement ?', 'ex.q3': 'Comment savoir si j\'en fais trop ?',

  'vit.title': 'Constantes et appareils', 'vit.subtitle': 'Ajoutez une mesure à la main ci-dessous. La synchronisation automatique des montres et appareils arrive bientôt.',
  'vit.connect': 'Connecter', 'vit.requiresApp': "Nécessite l'application mobile", 'vit.comingSoon': 'Bientôt disponible', 'vit.recent': 'Mesures récentes', 'vit.none': 'Aucune mesure.', 'vit.add': 'Ajouter une mesure', 'vit.value': 'Valeur',
  'vit.disclaimer': "Les mesures des montres et appareils grand public sont fournies à titre informatif et ne constituent pas un diagnostic médical. Si quelque chose ne va pas, contactez votre équipe soignante.",
  'vit.heart_rate': 'Fréquence cardiaque', 'vit.bp_systolic': 'Pression systolique', 'vit.spo2': 'SpO₂', 'vit.weight_kg': 'Poids', 'vit.temp_c': 'Température',

  'jr.title': 'Bilan quotidien', 'jr.subtitle': 'Une note rapide sur votre journée. Votre équipe soignante peut la voir entre les visites.',
  'jr.feeling': 'Comment vous sentez-vous ?', 'jr.pain': 'Niveau de douleur', 'jr.note': 'Quelque chose à signaler à votre équipe ? (gonflement, sommeil, questions…)',
  'jr.save': 'Enregistrer le bilan', 'jr.past': 'Bilans précédents',
  'jr.flag': "Douleur élevée notée — nous la signalerons à votre équipe soignante. En cas d'urgence, appelez maintenant le numéro d'urgence local.",

  'tr.title': 'Traitement et apprentissage', 'tr.subtitle': "Comprenez votre plan et posez toutes vos questions.",
  'tr.planDefault': "Votre équipe soignante ajoutera votre plan ici. En attendant, vous pouvez poser des questions générales sur le rétablissement.",
  'tr.planFallbackTitle': 'Votre plan de soins',
  'tr.aiLabel': 'Questions sur votre plan',
  'tr.aiDisclaimer': "Cet assistant explique votre plan à titre éducatif uniquement. Il ne peut pas diagnostiquer ni modifier vos médicaments ou doses — ces décisions reviennent à votre équipe soignante.",
  'tr.q1': 'Que comprend mon plan de rétablissement ?', 'tr.q2': 'Quels signes d\'alerte surveiller ?', 'tr.q3': 'Combien de temps dure la guérison ?',
  'ai.fallback': "Je peux donner des explications générales basées sur votre plan, mais j'ai du mal à me connecter pour le moment. Pour quelque chose de spécifique, contactez votre équipe soignante.",

  'nav.selfchart': 'Mon dossier',
  'sc.title': 'Mon dossier de santé',
  'sc.subtitle': 'Votre plan de soins, médicaments, résultats et apprentissage — en un seul endroit.',
  'sc.carePlan': 'Plan de soins',
  'sc.meds': 'Mes médicaments',
  'sc.medsCore': 'Régime principal',
  'sc.medsActive': 'Tous les médicaments actifs',
  'sc.medsEmpty': 'Aucun médicament actif dans votre dossier.',
  'sc.labs': 'Mes résultats dans le temps',
  'sc.labsEmpty': 'Aucun résultat de laboratoire dans votre dossier.',
  'sc.edu': 'En savoir plus sur mon traitement',
  'sc.eduEmpty': "Aucune entrée d'apprentissage pour l'instant.",
  'sc.vitalsTitle': 'Mesures des appareils',
  'sc.vitalsEmpty': "Aucune mesure des appareils. La synchronisation automatique apparaîtra ici une fois connecté.",
  'sc.autoTranslated': 'Traduction automatique',
  'sc.abnormal': 'Anormal',
  'sc.refRange': 'Réf :',
}

const DICTS: Record<Lang, Dict> = { en: EN, es: ES, fr: FR }

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, params?: Record<string, string | number>) => string }
const I18nContext = createContext<Ctx | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('cmp_lang') as Lang | null
    if (saved && DICTS[saved]) return saved
    const nav = navigator.language.slice(0, 2)
    return (nav === 'es' || nav === 'fr') ? nav : 'en'
  })
  useEffect(() => { localStorage.setItem('cmp_lang', lang) }, [lang])
  const t = (key: string, params?: Record<string, string | number>) => {
    let s = DICTS[lang][key] ?? EN[key] ?? key
    if (params) for (const k in params) s = s.replace(`{${k}}`, String(params[k]))
    return s
  }
  return <I18nContext.Provider value={{ lang, setLang: setLangState, t }}>{children}</I18nContext.Provider>
}

export function useT() {
  const v = useContext(I18nContext)
  if (!v) throw new Error('useT must be used within I18nProvider')
  return v
}
