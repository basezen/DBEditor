//
//  AppDelegate.swift
//  DBEditor
//
//  Created by Daniel Bromberg on 8/6/17.
//  Copyright © 2017 Daniel Bromberg. All rights reserved.
//

import UIKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?


    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplicationLaunchOptionsKey: Any]?) -> Bool {
        let v = AspectDescriptor(name: "Quantity", type: Int.Type.self, isVisible: true, isEditable: true)
        print("Created descriptor: \(v)")
        let a = Aspect(descriptor: v)
        print("Created aspect: \(a)")
        a.intValue = 3
        print("After setting to 3: \(a)")
        
        let v2 = AspectDescriptor(name: "Name", type: String.Type.self, isVisible: true, isEditable: true)
        print("Created descriptor: \(v2)")
        let a2 = Aspect(descriptor: v2)
        print("Created aspect: \(a2)")
        a2.stringValue = "ABC"
        print("After setting to ABC: \(a2)")
        
        a.value = 4
        a.value = "Blah"
        
        a2.value = "ABD"
        a2.value = 37
        a2.value = false
        a2.value = "Hi"
        
        return true
    }
}

