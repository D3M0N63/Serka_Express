// Ciudades y localidades de Paraguay (capitales departamentales + las
// ciudades mas pobladas de cada departamento), usadas como sugerencias
// en los selectores de ciudad de origen y perfil de usuario.
export const PY_CITIES = [
  "Asunción",
  // Central
  "San Lorenzo", "Luque", "Capiatá", "Lambaré", "Fernando de la Mora",
  "Limpio", "Ñemby", "San Antonio", "Villa Elisa", "Itauguá", "Areguá",
  "Guarambaré", "Itá", "Ypacaraí", "J. Augusto Saldívar",
  "Mariano Roque Alonso", "Nueva Italia", "Villeta", "Ypané",
  // Alto Paraná
  "Ciudad del Este", "Presidente Franco", "Hernandarias", "Minga Guazú",
  "Santa Rita", "Naranjal", "Domingo Martínez de Irala",
  "Juan León Mallorquín", "Los Cedrales", "Iruña", "Itakyry", "Yguazú",
  "San Cristóbal", "Mbaracayú", "Dr. Juan Manuel Frutos",
  "Santa Rosa del Monday",
  // Itapúa
  "Encarnación", "Cambyretá", "Capitán Miranda", "Bella Vista",
  "Coronel Bogado", "Carmen del Paraná", "Hohenau", "Obligado",
  "San Pedro del Paraná", "Jesús", "Trinidad", "Nueva Alborada", "Fram",
  "General Delgado", "Natalio", "Alto Verá", "Yatytay", "Edelira",
  "Tomás Romero Pereira", "San Rafael del Paraná",
  // Caaguazú
  "Coronel Oviedo", "Caaguazú", "Repatriación", "Cecilio Báez", "Yhú",
  "José Domingo Ocampos", "Raúl Arsenio Oviedo", "Simón Bolívar",
  "San José de los Arroyos", "Nueva Londres", "Santa Rosa del Mbutuy",
  "Vaquería", "La Pastora", "Carayaó",
  // Caazapá
  "Caazapá", "San Juan Nepomuceno", "Yuty", "Abaí", "Buena Vista",
  "Moisés Bertoni", "Maciel", "Tavaí",
  // Concepción
  "Concepción", "Horqueta", "Yby Yaú", "Belén", "Loreto", "San Lázaro",
  "Sargento José Félix López",
  // San Pedro
  "San Pedro del Ycuamandiyú", "San Estanislao", "Santaní", "Choré",
  "Guayaibí", "Lima", "Tacuatí", "Villa del Rosario",
  "Yataity del Norte", "San Vicente Pancholo", "General Isidoro Resquín",
  // Guairá
  "Villarrica", "Independencia", "Borja", "Coronel Martínez",
  "Félix Pérez Cardozo", "Iturbe", "Mbocayaty", "Ñumí", "Paso Yobái",
  "San Salvador", "Yataity", "José Fassardi",
  // Cordillera
  "Caacupé", "Atyrá", "Altos", "Arroyos y Esteros", "Caraguatay",
  "Emboscada", "Eusebio Ayala", "Isla Pucú", "Itacurubí de la Cordillera",
  "Juan de Mena", "Loma Grande", "Mbocayaty del Yhaguy",
  "Nueva Colombia", "Piribebuy", "Primero de Marzo", "San Bernardino",
  "Santa Elena", "Tobatí", "Valenzuela",
  // Ñeembucú
  "Pilar", "Alberdi", "Cerrito", "Desmochados", "General Díaz",
  "Guazú Cuá", "Humaitá", "Isla Umbú", "Laureles", "Mayor Martínez",
  "San Juan Bautista de Ñeembucú", "Tacuaras", "Villa Franca",
  "Villa Oliva", "Villalbín",
  // Amambay
  "Pedro Juan Caballero", "Bella Vista Amambay", "Capitán Bado",
  // Canindeyú
  "Salto del Guairá", "Curuguaty", "Ygatimí", "Katueté", "La Paloma",
  "Corpus Christi", "Nueva Esperanza", "Villa Ygatimí", "Yasy Cañy",
  "Francisco Caballero Álvarez", "Itanará",
  // Misiones
  "San Juan Bautista", "Ayolas", "San Ignacio", "San Miguel",
  "San Patricio", "Santa María", "Santa Rosa", "Santiago",
  "Villa Florida",
  // Paraguarí
  "Paraguarí", "Acahay", "Caapucú", "Escobar",
  "General Bernardino Caballero", "La Colmena", "María Antonia",
  "Mbuyapey", "Pirayú", "Quiindy", "Quyquyhó", "Sapucai", "Tebicuary",
  "Ybycuí", "Ybytimí", "Yaguarón",
  // Presidente Hayes (Chaco)
  "Villa Hayes", "Benjamín Aceval", "Nanawa", "Puerto Pinasco",
  "Teniente Esteban Martínez", "José Falcón",
  // Boquerón (Chaco)
  "Filadelfia", "Loma Plata", "Mariscal Estigarribia", "Neuland",
  // Alto Paraguay (Chaco)
  "Fuerte Olimpo", "Bahía Negra", "Carmelo Peralta", "Puerto Casado",
].sort((a, b) => a.localeCompare(b, "es"));
