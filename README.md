# 🚀 NavixAI

### Real-Time Collaborative Threat Intelligence for Smart Logistics

---

## 🧠 Overview

**NavixAI** is a futuristic, web-based logistics intelligence platform designed to **prevent cargo theft in real-time** using collaborative fleet data, anomaly detection, and dynamic rerouting.

Unlike traditional tracking systems that only provide location visibility, NavixAI introduces a **distributed intelligence network**, where vehicles actively share risk signals to protect each other.

---

## 🎯 Problem Statement

Cargo theft and tampering during transportation result in:

* Significant financial losses
* Supply chain disruptions
* Lack of real-time intervention
* No visibility into cargo-level risks

Current systems rely heavily on GPS tracking, which:

* Cannot detect theft in real-time
* Cannot identify suspicious behavior
* Cannot warn other vehicles

---

## 💡 Solution

NavixAI solves this by introducing:

> **A real-time collaborative threat intelligence system for logistics fleets**

### Key Idea:

* Detect **pre-theft anomalies**
* Convert them into **risk signals**
* Create **dynamic threat zones**
* Broadcast alerts to nearby vehicles
* Automatically **reroute vehicles to safety**

---

## 🔥 Core Features

### 🌍 Smart Route Planning

* Source → Destination input
* Route visualization using maps

---

### 🚚 Live Vehicle Simulation

* Real-time movement of trucks
* Continuous location updates

---

### 🧠 Risk Engine (Rule-Based AI)

* Detects:

  * Unauthorized stops
  * Route deviation
  * Door open events
* Calculates dynamic **risk score (0–100)**

---

### 🚨 Intelligent Alert System

* Context-aware alerts:

  * Warning
  * Critical
* Real-time UI notifications

---

### 🔴 Threat Zone System (Core Innovation)

* High-risk events create **geo-based threat zones**
* Zones are stored in Firestore
* Visualized as red danger areas on map

---

### 📡 Fleet Intelligence Network

* Vehicles listen to shared threat data
* Nearby vehicles get alerted instantly
* Enables **collaborative safety**

---

### 🔁 Smart Rerouting

* Vehicles approaching danger zones:

  * Get alerts
  * Automatically rerouted to safer paths

---

### 🔍 Universal Tracking

* Track any vehicle using:

  * Vehicle ID
  * Shipment ID

---

## 🧬 System Architecture

```
User Input → Route Engine → Vehicle Simulation → Event Detection
→ Risk Engine → Threat Zone Creation → Firestore Sync
→ Fleet Broadcast → Alert System → Smart Rerouting
```

---

## 🏗️ Tech Stack

### Frontend

* Next.js (App Router)
* TypeScript
* Tailwind CSS (Dark Cyber UI)

### Backend (Optional / Minimal)

* Firebase Firestore (Real-time DB)

### APIs & Services

* Google Maps API (Directions + Places)
* Firebase SDK

---

## 🔄 Data Flow

1. User creates a route
2. Vehicle simulation starts
3. Events are triggered
4. Risk score increases
5. Threat zone is created
6. Firestore updates in real-time
7. Other vehicles receive alerts
8. Vehicles reroute dynamically

---

## 🧪 Demo Flow

1. Enter source & destination
2. Truck starts moving
3. Trigger anomaly (e.g., door open)
4. Risk level increases
5. 🔴 Threat zone appears
6. Second vehicle receives alert
7. 🔁 Route is updated to avoid danger

---

## 🌍 Impact

NavixAI contributes to:

* 🚛 Safer logistics networks
* 📉 Reduced cargo theft
* ⚡ Faster response to incidents
* 🌐 Smarter supply chain systems

---

## 🎯 Future Scope

* Real IoT sensor integration
* Driver behavior analytics
* AI-based predictive modeling
* Integration with highway authorities (e.g., NHAI)
* Blockchain for shipment integrity

---

## ⚠️ Limitations (MVP)

* Uses simulated data instead of real sensors
* Rule-based risk engine (no ML yet)
* Limited real-world integrations

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/navixai.git
cd navixai
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment Variables

Create `.env.local`:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_maps_key
```

---

### 4. Run the App

```bash
npm run dev
```

---

## 📂 Project Structure

```
/app            → Pages & routes
/components     → UI components
/lib            → Firebase config
/services       → API & logic layer
/styles         → Global styles
```

---

## 🤝 Team

**The Algonauts**

* Jashwanth J
* Mathumitha S
* Madhusree M
* Harshini A

---

## 🏁 Final Note

NavixAI is not just a tracking system.

> It is a **collaborative intelligence network** that transforms how logistics safety is handled—
> from reactive monitoring → to proactive prevention.

---

⭐ If you found this project interesting, consider giving it a star!
