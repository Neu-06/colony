package com.colony.core;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class ColonyCoreApplication {

    public static void main(String[] args) {
        SpringApplication.run(ColonyCoreApplication.class, args);
    }
}
