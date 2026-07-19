# Stage 1: Build the React frontend and Spring Boot backend
FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app

# Copy the pom.xml and source code
COPY pom.xml .
COPY src ./src
COPY frontend ./frontend

# Package the application (this builds React and packages it inside the Spring Boot JAR)
RUN mvn clean package -DskipTests

# Stage 2: Minimal run container with JDK JRE
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# Copy the built JAR from the builder stage
COPY --from=build /app/target/codemorph-ai-1.0.0.jar app.jar

# Spring Boot will read the PORT environment variable injected by Render
EXPOSE 8085
ENTRYPOINT ["java", "-jar", "app.jar"]
