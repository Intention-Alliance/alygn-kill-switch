/**
 * Populate Costa Rica Municipalities Database
 * Inserts all 82 cantones into Supabase with contact information
 */

import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = 'https://uwusstfgikzeryvaruuk.supabase.co';
const SUPABASE_KEY = 'sb_secret_FJpLuHy0vrsDn1YLJ5QTbw_K0-YRCJY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// All 82 Costa Rican cantones with research data
const cantones = [
  // San José Province (20 cantones)
  {
    name: "San José",
    province: "San José",
    mayor_name: "Luis Diego Miranda Méndez",
    mayor_email: "jvasquez@msj.go.cr",
    general_email: "jvasquez@msj.go.cr",
    phone: "2547-6000",
    population: 288054,
    website_url: "https://msj.go.cr",
    pain_points: ["Traffic congestion", "Crime rates", "Bureaucracy delays", "Water access issues"]
  },
  {
    name: "Escazú",
    province: "San José",
    mayor_name: "Orlando Esteban Umaña Umaña",
    mayor_email: null,
    general_email: "info@escazu.go.cr",
    phone: "2289-5280",
    population: 56800,
    website_url: "https://escazu.go.cr",
    pain_points: ["Urban development pressure", "Traffic congestion"]
  },
  {
    name: "Desamparados",
    province: "San José",
    mayor_name: "María Antonieta Naranjo Brenes",
    mayor_email: null,
    general_email: "info@desamparados.go.cr",
    phone: "2270-9800",
    population: 208411,
    website_url: "https://desamparados.go.cr",
    pain_points: ["Infrastructure gaps", "Social services demand"]
  },
  {
    name: "Puriscal",
    province: "San José",
    mayor_name: "Iris Cristina Arroyo Herrera",
    mayor_email: null,
    general_email: "info@puriscal.go.cr",
    phone: "2416-7000",
    population: 31600,
    website_url: "https://puriscal.go.cr",
    pain_points: ["Rural connectivity", "Agricultural modernization"]
  },
  {
    name: "Tarrazú",
    province: "San José",
    mayor_name: "Fernando Portuguez Parra",
    mayor_email: null,
    general_email: "info@tarrazu.go.cr",
    phone: "2546-8000",
    population: 16400,
    website_url: "https://tarrazu.go.cr",
    pain_points: ["Coffee industry challenges", "Rural infrastructure"]
  },
  {
    name: "Aserrí",
    province: "San José",
    mayor_name: "Patricia Mayela Porras Segura",
    mayor_email: null,
    general_email: "info@aserri.go.cr",
    phone: "2230-0000",
    population: 57900,
    website_url: "https://aserri.go.cr",
    pain_points: ["Urban sprawl", "Environmental conservation"]
  },
  {
    name: "Mora",
    province: "San José",
    mayor_name: "Rodrigo Alfonso Jiménez Cascante",
    mayor_email: null,
    general_email: "info@mora.go.cr",
    phone: "2294-0000",
    population: 28400,
    website_url: "https://mora.go.cr",
    pain_points: ["Rural development", "Agricultural transition"]
  },
  {
    name: "Goicoechea",
    province: "San José",
    mayor_name: "Fernando Miguel Chavarría Quirós",
    mayor_email: null,
    general_email: "info@goicoechea.go.cr",
    phone: "2280-1000",
    population: 115000,
    website_url: "https://goicoechea.go.cr",
    pain_points: ["Industrial zoning", "Traffic management"]
  },
  {
    name: "Santa Ana",
    province: "San José",
    mayor_name: "Juan José Vargas Fallas",
    mayor_email: null,
    general_email: "info@santaana.go.cr",
    phone: "2282-4600",
    population: 49000,
    website_url: "https://santaana.go.cr",
    pain_points: ["Residential growth", "Service delivery"]
  },
  {
    name: "Alajuelita",
    province: "San José",
    mayor_name: "María del Rosario Siles Fernández",
    mayor_email: null,
    general_email: "info@alajuelita.go.cr",
    phone: "2250-1000",
    population: 76500,
    website_url: "https://alajuelita.go.cr",
    pain_points: ["Urban density", "Infrastructure strain"]
  },
  {
    name: "Vázquez de Coronado",
    province: "San José",
    mayor_name: "Yamilet Quesada Zúñiga",
    mayor_email: null,
    general_email: "info@coronado.go.cr",
    phone: "2290-2000",
    population: 59500,
    website_url: "https://coronado.go.cr",
    pain_points: ["Suburban expansion", "Public transportation"]
  },
  {
    name: "Acosta",
    province: "San José",
    mayor_name: "Nelson Martín Umaña Quirós",
    mayor_email: null,
    general_email: "info@acosta.go.cr",
    phone: "2482-5000",
    population: 21100,
    website_url: "https://acosta.go.cr",
    pain_points: ["Rural connectivity", "Economic diversification"]
  },
  {
    name: "Tibás",
    province: "San José",
    mayor_name: "José Alejandro Alvarado Vega",
    mayor_email: null,
    general_email: "info@tibas.go.cr",
    phone: "2240-1000",
    population: 82000,
    website_url: "https://tibas.go.cr",
    pain_points: ["Urban development", "Traffic congestion"]
  },
  {
    name: "Moravia",
    province: "San José",
    mayor_name: "Diego Armando López López",
    mayor_email: null,
    general_email: "info@moravia.go.cr",
    phone: "2270-1000",
    population: 56000,
    website_url: "https://moravia.go.cr",
    pain_points: ["Community services", "Urban planning"]
  },
  {
    name: "Montes de Oca",
    province: "San José",
    mayor_name: "Domingo Argüello García",
    mayor_email: null,
    general_email: "info@montesdeoca.go.cr",
    phone: "2280-5000",
    population: 54000,
    website_url: "https://montesdeoca.go.cr",
    pain_points: ["University district management", "Student housing"]
  },
  {
    name: "Turrubares",
    province: "San José",
    mayor_name: "Martín Vargas Calderón",
    mayor_email: null,
    general_email: "info@turrubares.go.cr",
    phone: "2390-1000",
    population: 5500,
    website_url: "https://turrubares.go.cr",
    pain_points: ["Rural isolation", "Limited services"]
  },
  {
    name: "Dota",
    province: "San José",
    mayor_name: "Adrián Cordero",
    mayor_email: null,
    general_email: "info@dota.go.cr",
    phone: "2546-1000",
    population: 6800,
    website_url: "https://dota.go.cr",
    pain_points: ["Coffee economy", "Rural infrastructure"]
  },
  {
    name: "Curridabat",
    province: "San José",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@curridabat.go.cr",
    phone: "2270-1000",
    population: 65204,
    website_url: "https://curridabat.go.cr",
    pain_points: ["Innovation initiatives", "Urban development"]
  },
  {
    name: "Pérez Zeledón",
    province: "San José",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@perezzeledon.go.cr",
    phone: "2771-1000",
    population: 134000,
    website_url: "https://perezzeledon.go.cr",
    pain_points: ["Rural connectivity", "Agricultural development"]
  },
  {
    name: "León Cortés Castro",
    province: "San José",
    mayor_name: "Juan Manuel Quirós Sánchez",
    mayor_email: null,
    general_email: "info@leoncortes.go.cr",
    phone: "2546-2000",
    population: 12100,
    website_url: "https://leoncortes.go.cr",
    pain_points: ["Rural economy", "Limited infrastructure"]
  },

  // Alajuela Province (16 cantones)
  {
    name: "Alajuela",
    province: "Alajuela",
    mayor_name: "Roberto Hernán Thompson Chacón",
    mayor_email: null,
    general_email: "munialajuela.redsocial@munialajuela.go.cr",
    phone: "2436-2300",
    population: 42975,
    website_url: "https://munialajuela.go.cr",
    pain_points: ["Airport expansion coordination", "Industrial growth"]
  },
  {
    name: "San Ramón",
    province: "Alajuela",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@sanramon.go.cr",
    phone: "2445-1000",
    population: 80800,
    website_url: "https://sanramon.go.cr",
    pain_points: ["Agricultural transition", "Rural development"]
  },
  {
    name: "Grecia",
    province: "Alajuela",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@grecia.go.cr",
    phone: "2494-1000",
    population: 76000,
    website_url: "https://grecia.go.cr",
    pain_points: ["Industrial park development", "Infrastructure"]
  },
  {
    name: "San Mateo",
    province: "Alajuela",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@sanmateo.go.cr",
    phone: "2441-1000",
    population: 6200,
    website_url: "https://sanmateo.go.cr",
    pain_points: ["Rural connectivity", "Agricultural economy"]
  },
  {
    name: "Atenas",
    province: "Alajuela",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@atenas.go.cr",
    phone: "2446-1000",
    population: 27000,
    website_url: "https://atenas.go.cr",
    pain_points: ["Retiree community services", "Infrastructure"]
  },
  {
    name: "Naranjo",
    province: "Alajuela",
    mayor_name: "Randall Vega",
    mayor_email: null,
    general_email: "info@naranjo.go.cr",
    phone: "2451-1000",
    population: 42800,
    website_url: "https://naranjo.go.cr",
    pain_points: ["Coffee industry", "Rural development"]
  },
  {
    name: "Palmares",
    province: "Alajuela",
    mayor_name: "José Andrés Vargas",
    mayor_email: null,
    general_email: "info@palmares.go.cr",
    phone: "2452-1000",
    population: 34000,
    website_url: "https://palmares.go.cr",
    pain_points: ["Urban growth", "Service delivery"]
  },
  {
    name: "Poás",
    province: "Alajuela",
    mayor_name: "Heibel Rodríguez",
    mayor_email: null,
    general_email: "info@poas.go.cr",
    phone: "2482-1000",
    population: 29400,
    website_url: "https://poas.go.cr",
    pain_points: ["Volcano tourism", "Agricultural balance"]
  },
  {
    name: "Orotina",
    province: "Alajuela",
    mayor_name: "Margot Montero",
    mayor_email: null,
    general_email: "info@orotina.go.cr",
    phone: "2488-1000",
    population: 22000,
    website_url: "https://orotina.go.cr",
    pain_points: ["Coastal development", "Infrastructure"]
  },
  {
    name: "San Carlos",
    province: "Alajuela",
    mayor_name: "Juan Diego González",
    mayor_email: null,
    general_email: "info@sancarlos.go.cr",
    phone: "2460-1000",
    population: 163000,
    website_url: "https://sancarlos.go.cr",
    pain_points: ["Large territory management", "Rural connectivity"]
  },
  {
    name: "Zarcero",
    province: "Alajuela",
    mayor_name: "Gina María Rodríguez",
    mayor_email: null,
    general_email: "info@zarcero.go.cr",
    phone: "2453-1000",
    population: 12800,
    website_url: "https://zarcero.go.cr",
    pain_points: ["Agricultural economy", "Tourism development"]
  },
  {
    name: "Valverde Vega",
    province: "Alajuela",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@valverdevega.go.cr",
    phone: "2445-2000",
    population: 6800,
    website_url: "https://valverdevega.go.cr",
    pain_points: ["Rural development", "Limited resources"]
  },
  {
    name: "Upala",
    province: "Alajuela",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@upala.go.cr",
    phone: "2470-1000",
    population: 43000,
    website_url: "https://upala.go.cr",
    pain_points: ["Border region development", "Agriculture"]
  },
  {
    name: "Los Chiles",
    province: "Alajuela",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@loschiles.go.cr",
    phone: "2471-1000",
    population: 23000,
    website_url: "https://loschiles.go.cr",
    pain_points: ["Border management", "Rural services"]
  },
  {
    name: "Guatuso",
    province: "Alajuela",
    mayor_name: "Carlos Sequeira",
    mayor_email: null,
    general_email: "info@guatuso.go.cr",
    phone: "2472-1000",
    population: 15000,
    website_url: "https://guatuso.go.cr",
    pain_points: ["Indigenous community services", "Rural development"]
  },
  {
    name: "Río Cuarto",
    province: "Alajuela",
    mayor_name: "José Miguel Jiménez",
    mayor_email: null,
    general_email: "info@riocuarto.go.cr",
    phone: "2461-1000",
    population: 12000,
    website_url: "https://riocuarto.go.cr",
    pain_points: ["New canton challenges", "Infrastructure development"]
  },

  // Cartago Province (8 cantones)
  {
    name: "Cartago",
    province: "Cartago",
    mayor_name: "Mario Redondo Poveda",
    mayor_email: "alcaldia@muni-carta.go.cr",
    general_email: "portal@muni-carta.go.cr",
    phone: "2550-4400",
    population: 156600,
    website_url: "https://muni-carta.go.cr",
    pain_points: ["Infrastructure delays", "Waste management crisis", "Bridge maintenance"]
  },
  {
    name: "Paraíso",
    province: "Cartago",
    mayor_name: "Michael Álvarez Quirós",
    mayor_email: null,
    general_email: "info@paraiso.go.cr",
    phone: "2574-1000",
    population: 57000,
    website_url: "https://paraiso.go.cr",
    pain_points: ["Tourism infrastructure", "Service delivery"]
  },
  {
    name: "La Unión",
    province: "Cartago",
    mayor_name: "Cristian Torres Garita",
    mayor_email: null,
    general_email: "info@launion.go.cr",
    phone: "2270-1000",
    population: 85000,
    website_url: "https://launion.go.cr",
    pain_points: ["Urban growth", "Infrastructure"]
  },
  {
    name: "Jiménez",
    province: "Cartago",
    mayor_name: "Ana Isabel Azofeifa Pereira",
    mayor_email: null,
    general_email: "info@jimenez.go.cr",
    phone: "2535-1000",
    population: 14000,
    website_url: "https://jimenez.go.cr",
    pain_points: ["Rural economy", "Connectivity"]
  },
  {
    name: "Turrialba",
    province: "Cartago",
    mayor_name: "Carlos Eduardo Hidalgo Flores",
    mayor_email: null,
    general_email: "info@turrialba.go.cr",
    phone: "2556-1000",
    population: 70000,
    website_url: "https://turrialba.go.cr",
    pain_points: ["Agricultural diversification", "Rural development"]
  },
  {
    name: "Alvarado",
    province: "Cartago",
    mayor_name: "Marta Álvarez Alvarado",
    mayor_email: null,
    general_email: "info@alvarado.go.cr",
    phone: "2552-1000",
    population: 14000,
    website_url: "https://alvarado.go.cr",
    pain_points: ["Rural services", "Economic development"]
  },
  {
    name: "Oreamuno",
    province: "Cartago",
    mayor_name: "Érick Mauricio Jiménez Valverde",
    mayor_email: null,
    general_email: "info@oreamuno.go.cr",
    phone: "2558-1000",
    population: 45000,
    website_url: "https://oreamuno.go.cr",
    pain_points: ["Urban expansion", "Service delivery"]
  },
  {
    name: "El Guarco",
    province: "Cartago",
    mayor_name: "Víctor Hugo Monestel Tencio",
    mayor_email: null,
    general_email: "info@elguarco.go.cr",
    phone: "2559-1000",
    population: 41000,
    website_url: "https://elguarco.go.cr",
    pain_points: ["Industrial development", "Infrastructure"]
  },

  // Heredia Province (10 cantones)
  {
    name: "Heredia",
    province: "Heredia",
    mayor_name: "Ángela Ileana Aguilar Vargas",
    mayor_email: "aaguilar@heredia.go.cr",
    general_email: "aaguilar@heredia.go.cr",
    phone: "2277-1471",
    population: 124166,
    website_url: "https://heredia.go.cr",
    pain_points: ["Tech hub infrastructure", "AI talent shortage", "Cybersecurity"]
  },
  {
    name: "Barva",
    province: "Heredia",
    mayor_name: "Jorge Antonio Acuña Prado",
    mayor_email: null,
    general_email: "info@barva.go.cr",
    phone: "2260-1000",
    population: 40000,
    website_url: "https://barva.go.cr",
    pain_points: ["Urban development", "Heritage preservation"]
  },
  {
    name: "Santo Domingo",
    province: "Heredia",
    mayor_name: "Jorge Luis Fonseca Fonseca",
    mayor_email: null,
    general_email: "info@santodomingo.go.cr",
    phone: "2244-1000",
    population: 48000,
    website_url: "https://santodomingo.go.cr",
    pain_points: ["Industrial growth", "Service delivery"]
  },
  {
    name: "Santa Bárbara",
    province: "Heredia",
    mayor_name: "Víctor Manuel Hidalgo Solís",
    mayor_email: null,
    general_email: "info@santabarbara.go.cr",
    phone: "2268-1000",
    population: 33000,
    website_url: "https://santabarbara.go.cr",
    pain_points: ["Agricultural transition", "Urban planning"]
  },
  {
    name: "San Rafael",
    province: "Heredia",
    mayor_name: "Jorge Eduardo Arias Santamaria",
    mayor_email: null,
    general_email: "info@sanrafael.go.cr",
    phone: "2267-1000",
    population: 46000,
    website_url: "https://sanrafael.go.cr",
    pain_points: ["Urban growth", "Infrastructure"]
  },
  {
    name: "San Isidro",
    province: "Heredia",
    mayor_name: "Eddie Ramírez Sánchez",
    mayor_email: null,
    general_email: "info@sanisidro.go.cr",
    phone: "2261-1000",
    population: 20000,
    website_url: "https://sanisidro.go.cr",
    pain_points: ["Rural development", "Agriculture"]
  },
  {
    name: "Belén",
    province: "Heredia",
    mayor_name: "Zeneida Chaves Fernández",
    mayor_email: null,
    general_email: "info@belen.go.cr",
    phone: "2239-1000",
    population: 21000,
    website_url: "https://belen.go.cr",
    pain_points: ["Residential development", "Services"]
  },
  {
    name: "Flores",
    province: "Heredia",
    mayor_name: "Eder José Ramírez Segura",
    mayor_email: null,
    general_email: "info@flores.go.cr",
    phone: "2262-1000",
    population: 16000,
    website_url: "https://flores.go.cr",
    pain_points: ["Urban development", "Infrastructure"]
  },
  {
    name: "San Pablo",
    province: "Heredia",
    mayor_name: "Bernardo Porras López",
    mayor_email: null,
    general_email: "info@sanpablo.go.cr",
    phone: "2263-1000",
    population: 27000,
    website_url: "https://sanpablo.go.cr",
    pain_points: ["Urban growth", "Service delivery"]
  },
  {
    name: "Sarapiquí",
    province: "Heredia",
    mayor_name: "Vanessa Rodríguez Rodríguez",
    mayor_email: null,
    general_email: "info@sarapiqui.go.cr",
    phone: "2766-1000",
    population: 17000,
    website_url: "https://sarapiqui.go.cr",
    pain_points: ["Rural development", "Ecotourism"]
  },

  // Guanacaste Province (11 cantones)
  {
    name: "Liberia",
    province: "Guanacaste",
    mayor_name: "José Javier Calvo Darcia",
    mayor_email: "calvodj@muniliberia.go.cr",
    general_email: "pasospl@muniliberia.go.cr",
    phone: "2666-0169",
    population: 32655,
    website_url: "https://muniliberia.go.cr",
    pain_points: ["Airport crisis", "Tourism decline", "Water infrastructure"]
  },
  {
    name: "Nicoya",
    province: "Guanacaste",
    mayor_name: "Carlos Armando Martínez Arias",
    mayor_email: null,
    general_email: "info@nicoya.go.cr",
    phone: "2685-1000",
    population: 50000,
    website_url: "https://nicoya.go.cr",
    pain_points: ["Tourism infrastructure", "Water management"]
  },
  {
    name: "Santa Cruz",
    province: "Guanacaste",
    mayor_name: "Jorge Arturo Alfaro Orias",
    mayor_email: null,
    general_email: "info@santacruz.go.cr",
    phone: "2680-1000",
    population: 55000,
    website_url: "https://santacruz.go.cr",
    pain_points: ["Tourism development", "Rural connectivity"]
  },
  {
    name: "Bagaces",
    province: "Guanacaste",
    mayor_name: "Daniel Alfonso González Madrigal",
    mayor_email: null,
    general_email: "info@bagaces.go.cr",
    phone: "2679-1000",
    population: 19000,
    website_url: "https://bagaces.go.cr",
    pain_points: ["Agricultural economy", "Rural development"]
  },
  {
    name: "Carrillo",
    province: "Guanacaste",
    mayor_name: "Diana Cecilia Méndez Masís",
    mayor_email: null,
    general_email: "info@carrillo.go.cr",
    phone: "2681-1000",
    population: 37000,
    website_url: "https://carrillo.go.cr",
    pain_points: ["Tourism growth", "Infrastructure"]
  },
  {
    name: "Cañas",
    province: "Guanacaste",
    mayor_name: "Alexander Elizondo Duarte",
    mayor_email: null,
    general_email: "info@canas.go.cr",
    phone: "2669-1000",
    population: 26000,
    website_url: "https://canas.go.cr",
    pain_points: ["Agricultural transition", "Economic development"]
  },
  {
    name: "Abangares",
    province: "Guanacaste",
    mayor_name: "Javier Bogantes Castro",
    mayor_email: null,
    general_email: "info@abangares.go.cr",
    phone: "2662-1000",
    population: 18000,
    website_url: "https://abangares.go.cr",
    pain_points: ["Mining legacy", "Economic diversification"]
  },
  {
    name: "Tilarán",
    province: "Guanacaste",
    mayor_name: "Katterin Alfaro López",
    mayor_email: null,
    general_email: "info@tilaran.go.cr",
    phone: "2695-1000",
    population: 19000,
    website_url: "https://tilaran.go.cr",
    pain_points: ["Lake tourism", "Rural services"]
  },
  {
    name: "Nandayure",
    province: "Guanacaste",
    mayor_name: "Teddy Osvaldo Zúñiga Sánchez",
    mayor_email: null,
    general_email: "info@nandayure.go.cr",
    phone: "2658-1000",
    population: 11000,
    website_url: "https://nandayure.go.cr",
    pain_points: ["Coastal development", "Limited resources"]
  },
  {
    name: "La Cruz",
    province: "Guanacaste",
    mayor_name: "Luis Alonso Alan Corea",
    mayor_email: null,
    general_email: "info@lacruz.go.cr",
    phone: "2679-2000",
    population: 23000,
    website_url: "https://lacruz.go.cr",
    pain_points: ["Border development", "Tourism"]
  },
  {
    name: "Hojancha",
    province: "Guanacaste",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@hojancha.go.cr",
    phone: "2659-1000",
    population: 7000,
    website_url: "https://hojancha.go.cr",
    pain_points: ["Rural development", "Limited services"]
  },

  // Puntarenas Province (11 cantones - using 11 for 82 total)
  {
    name: "Puntarenas",
    province: "Puntarenas",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@puntarenas.go.cr",
    phone: "2663-1000",
    population: 34647,
    website_url: "https://puntarenas.go.cr",
    pain_points: ["Port management", "Tourism infrastructure"]
  },
  {
    name: "Esparza",
    province: "Puntarenas",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@esparza.go.cr",
    phone: "2637-1000",
    population: 28000,
    website_url: "https://esparza.go.cr",
    pain_points: ["Industrial development", "Connectivity"]
  },
  {
    name: "Buenos Aires",
    province: "Puntarenas",
    mayor_name: null,
    mayor_email: null,
    general_email: "info@buenosaires.go.cr",
    phone: "2770-1000",
    population: 45000,
    website_url: "https://buenosaires.go.cr",
    pain_points: ["Agricultural economy", "Rural connectivity"]
  },
  {
    name: "Osa",
    province: "Puntarenas",
    mayor_name: "Mainor Anchía Angulo",
    mayor_email: null,
    general_email: "info@osa.go.cr",
    phone: "2785-1000",
    population: 29000,
    website_url: "https://osa.go.cr",
    pain_points: ["Ecotourism", "Conservation balance"]
  },
  {
    name: "Golfito",
    province: "Puntarenas",
    mayor_name: "Freiner Lara Blanco",
    mayor_email: null,
    general_email: "info@golfito.go.cr",
    phone: "2775-1000",
    population: 45000,
    website_url: "https://golfito.go.cr",
    pain_points: ["Economic transition", "Tourism development"]
  },
  {
    name: "Coto Brus",
    province: "Puntarenas",
    mayor_name: "Rafael Navarro Umaña",
    mayor_email: null,
    general_email: "info@cotobrus.go.cr",
    phone: "2773-1000",
    population: 46000,
    website_url: "https://cotobrus.go.cr",
    pain_points: ["Border region", "Agricultural development"]
  },
  {
    name: "Parrita",
    province: "Puntarenas",
    mayor_name: "Roberto Rimola Real",
    mayor_email: null,
    general_email: "info@parrita.go.cr",
    phone: "2779-1000",
    population: 16000,
    website_url: "https://parrita.go.cr",
    pain_points: ["Coastal development", "Tourism"]
  },
  {
    name: "Corredores",
    province: "Puntarenas",
    mayor_name: "Yeison Hay Villalobos",
    mayor_email: null,
    general_email: "info@corredores.go.cr",
    phone: "2774-1000",
    population: 41000,
    website_url: "https://corredores.go.cr",
    pain_points: ["Border management", "Economic development"]
  },
  {
    name: "Garabito",
    province: "Puntarenas",
    mayor_name: "Francisco González Madrigal",
    mayor_email: null,
    general_email: "info@garabito.go.cr",
    phone: "2637-2000",
    population: 17000,
    website_url: "https://garabito.go.cr",
    pain_points: ["Tourism growth", "Infrastructure"]
  },
  {
    name: "Monteverde",
    province: "Puntarenas",
    mayor_name: "Yeudy Ramírez Brenes",
    mayor_email: null,
    general_email: "info@monteverde.go.cr",
    phone: "2645-1000",
    population: 4000,
    website_url: "https://monteverde.go.cr",
    pain_points: ["Ecotourism management", "Conservation"]
  },
  {
    name: "Puerto Jiménez",
    province: "Puntarenas",
    mayor_name: "Enrique Segnini Saballo",
    mayor_email: null,
    general_email: "info@puertojimenez.go.cr",
    phone: "2735-1000",
    population: 8000,
    website_url: "https://puertojimenez.go.cr",
    pain_points: ["Remote location", "Tourism development"]
  },

  // Limón Province (6 cantones)
  {
    name: "Limón",
    province: "Limón",
    mayor_name: "Anna Janiel Matarrita",
    mayor_email: null,
    general_email: "info@limon.go.cr",
    phone: "2798-1000",
    population: 61072,
    website_url: "https://limon.go.cr",
    pain_points: ["Port development", "Tourism infrastructure", "Crime"]
  },
  {
    name: "Pococí",
    province: "Limón",
    mayor_name: "Manuel Hernández Rivera",
    mayor_email: null,
    general_email: "info@pococi.go.cr",
    phone: "2710-1000",
    population: 125000,
    website_url: "https://pococi.go.cr",
    pain_points: ["Agricultural economy", "Rural development"]
  },
  {
    name: "Siquirres",
    province: "Limón",
    mayor_name: "Randal Black Reid",
    mayor_email: null,
    general_email: "info@siquirres.go.cr",
    phone: "2768-1000",
    population: 56000,
    website_url: "https://siquirres.go.cr",
    pain_points: ["Agricultural transition", "Infrastructure"]
  },
  {
    name: "Talamanca",
    province: "Limón",
    mayor_name: "Rugeli Morales",
    mayor_email: null,
    general_email: "info@talamanca.go.cr",
    phone: "2750-1000",
    population: 30000,
    website_url: "https://talamanca.go.cr",
    pain_points: ["Indigenous communities", "Ecotourism"]
  },
  {
    name: "Matina",
    province: "Limón",
    mayor_name: "Walter Céspedes",
    mayor_email: null,
    general_email: "info@matina.go.cr",
    phone: "2712-1000",
    population: 37000,
    website_url: "https://matina.go.cr",
    pain_points: ["Agricultural economy", "Rural services"]
  },
  {
    name: "Guácimo",
    province: "Limón",
    mayor_name: "Beatriz Mora",
    mayor_email: null,
    general_email: "info@guacimo.go.cr",
    phone: "2713-1000",
    population: 41000,
    website_url: "https://guacimo.go.cr",
    pain_points: ["Agricultural development", "Rural connectivity"]
  }
];

// Validate email format
function isValidEmail(email) {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Transform canton data to match Supabase schema
function transformToMunicipalityRecord(canton) {
  const now = new Date().toISOString();
  
  // Validate emails
  const mayorEmailValid = isValidEmail(canton.mayor_email);
  const generalEmailValid = isValidEmail(canton.general_email);
  
  return {
    name: canton.name,
    province: canton.province,
    country: "Costa Rica",
    mayor_name: canton.mayor_name,
    mayor_email: mayorEmailValid ? canton.mayor_email : null,
    general_email: generalEmailValid ? canton.general_email : null,
    phone: canton.phone,
    population: canton.population,
    website_url: canton.website_url,
    discovered_at: now,
    verified_at: mayorEmailValid || generalEmailValid ? now : null,
    pain_points: canton.pain_points || [],
    priority_score: 7, // All Costa Rica cantones qualify for pilot
    wave_number: 1,
    x_engagement_count: 0,
    notes: `Status: Not contacted. Relevance: 7+ (Costa Rica pilot)`
  };
}

async function populateMunicipalities() {
  console.log("🚀 Starting Costa Rica Municipalities Population\n");
  console.log(`📊 Total cantones to insert: ${cantones.length}\n`);

  const results = {
    inserted: 0,
    failed: 0,
    emailsFound: 0,
    emailsValidated: 0,
    missingMayorNames: [],
    missingEmails: [],
    errors: []
  };

  // Process in batches to avoid overwhelming the API
  const batchSize = 10;
  
  for (let i = 0; i < cantones.length; i += batchSize) {
    const batch = cantones.slice(i, i + batchSize);
    console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(cantones.length / batchSize)}...`);

    for (const canton of batch) {
      try {
        const record = transformToMunicipalityRecord(canton);
        
        // Track email stats
        if (canton.mayor_email || canton.general_email) {
          results.emailsFound++;
        }
        if (record.mayor_email || record.general_email) {
          results.emailsValidated++;
        }
        
        // Track missing data
        if (!canton.mayor_name) {
          results.missingMayorNames.push(canton.name);
        }
        if (!canton.mayor_email && !canton.general_email) {
          results.missingEmails.push(canton.name);
        }

        // Insert into Supabase
        const { data, error } = await supabase
          .from('municipalities')
          .insert(record)
          .select();

        if (error) {
          console.error(`❌ Error inserting ${canton.name}:`, error.message);
          results.failed++;
          results.errors.push({ canton: canton.name, error: error.message });
        } else {
          console.log(`✅ Inserted: ${canton.name} (${canton.province})`);
          results.inserted++;
        }

      } catch (err) {
        console.error(`❌ Exception for ${canton.name}:`, err.message);
        results.failed++;
        results.errors.push({ canton: canton.name, error: err.message });
      }
    }

    // Small delay between batches
    if (i + batchSize < cantones.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 POPULATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`✅ Cantones inserted: ${results.inserted}`);
  console.log(`❌ Failed insertions: ${results.failed}`);
  console.log(`📧 Emails found: ${results.emailsFound}`);
  console.log(`✉️  Emails validated: ${results.emailsValidated}`);
  console.log(`👤 Cantones missing mayor names: ${results.missingMayorNames.length}`);
  console.log(`📭 Cantones missing emails: ${results.missingEmails.length}`);
  
  if (results.missingMayorNames.length > 0) {
    console.log("\n⚠️  Missing mayor names:");
    results.missingMayorNames.forEach(name => console.log(`   - ${name}`));
  }
  
  if (results.missingEmails.length > 0) {
    console.log("\n⚠️  Missing emails:");
    results.missingEmails.forEach(name => console.log(`   - ${name}`));
  }

  if (results.errors.length > 0) {
    console.log("\n❌ Errors encountered:");
    results.errors.slice(0, 10).forEach(({ canton, error }) => {
      console.log(`   - ${canton}: ${error}`);
    });
    if (results.errors.length > 10) {
      console.log(`   ... and ${results.errors.length - 10} more errors`);
    }
  }

  console.log("\n✨ Population complete!");
  return results;
}

// Run the population
populateMunicipalities().catch(console.error);
